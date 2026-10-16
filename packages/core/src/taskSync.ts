import {
  careEvents,
  db,
  externalIdentities,
  externalLinks,
  observations,
  spots,
  taskComments,
  tasks,
  users,
} from "@placekeeping/db";
import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { asanaRequest } from "./asanaClient";
import type { ExternalIdentityRow } from "./asanaClient";
import { logEvent } from "./events";
import {
  getBinding,
  getEffectiveBinding,
  type BindingRow,
  type BindingScope,
} from "./integrations";

// Mirrors native tasks to the Asana project their place is bound to.
// Native is the source of truth: every task is created here, then copied to
// Asana as a linked task (an external_links row, target_type "task"). Edits
// push out immediately; a periodic job (runTaskSync) retries failed pushes
// and pulls Asana-side changes back. Comments are pushed one way only.
// Nothing here ever throws into a user's request: a failed push is recorded
// on the task (externalSyncStatus "failed") and retried.

type TaskRow = typeof tasks.$inferSelect;

const MAX_ATTEMPTS = 5;
// Tolerates clock skew between Asana's modified_at and our synced-at stamp,
// which is taken after the push's response arrives.
const SKEW_MS = 10_000;
const PULL_BATCH = 100;
const PUSH_BATCH = 100;

export function isAsanaSyncEnabled(): boolean {
  return process.env.ENABLE_INTEGRATION_ASANA === "true";
}

function appBaseUrl() {
  return process.env.APP_BASE_URL ?? "http://localhost:3000";
}

// ---- resolving where a task syncs to -------------------------------------------

async function placeOfTask(row: TaskRow): Promise<{
  spot: { spotId: number; siteId: number | null; stewardId: string | null } | null;
  siteId: number | null;
}> {
  let spotId = row.spotId;
  let siteId = row.siteId;
  if (spotId == null && row.observationId) {
    const [o] = await db
      .select({ spotId: observations.spotId })
      .from(observations)
      .where(eq(observations.observationId, row.observationId))
      .limit(1);
    spotId = o?.spotId ?? null;
  }
  if (spotId == null && row.eventId) {
    const [e] = await db
      .select({ spotId: careEvents.spotId, siteId: careEvents.siteId })
      .from(careEvents)
      .where(eq(careEvents.id, row.eventId))
      .limit(1);
    spotId = e?.spotId ?? null;
    siteId = siteId ?? e?.siteId ?? null;
  }
  if (spotId != null) {
    const [spot] = await db
      .select({ spotId: spots.spotId, siteId: spots.siteId, stewardId: spots.stewardId })
      .from(spots)
      .where(eq(spots.spotId, spotId))
      .limit(1);
    return { spot: spot ?? null, siteId: null };
  }
  return { spot: null, siteId };
}

// Spot-level tasks use the effective binding (spot, else site, else steward);
// a site-level task uses the site's own binding only.
async function bindingForTask(row: TaskRow): Promise<BindingRow | null> {
  const place = await placeOfTask(row);
  if (place.spot) return (await getEffectiveBinding(place.spot))?.binding ?? null;
  if (place.siteId != null) return getBinding({ siteId: place.siteId });
  return null;
}

// Acts as the person who made the change when they have Asana connected in
// the project's workspace, else as whoever bound the project.
async function syncIdentity(
  binding: BindingRow,
  preferredUserId: string | null,
): Promise<ExternalIdentityRow | null> {
  const candidates = [preferredUserId, binding.configuredBy].filter(
    (u): u is string => !!u,
  );
  for (const userId of candidates) {
    const [row] = await db
      .select()
      .from(externalIdentities)
      .where(
        and(
          eq(externalIdentities.userId, userId),
          eq(externalIdentities.system, "asana"),
          eq(externalIdentities.remoteWorkspaceId, binding.remoteWorkspaceId),
          eq(externalIdentities.status, "active"),
        ),
      )
      .limit(1);
    if (row) return row;
  }
  return null;
}

async function remoteUserIdFor(userId: string | null, workspaceId: string) {
  if (!userId) return null;
  const [row] = await db
    .select({ remoteUserId: externalIdentities.remoteUserId })
    .from(externalIdentities)
    .where(
      and(
        eq(externalIdentities.userId, userId),
        eq(externalIdentities.system, "asana"),
        eq(externalIdentities.remoteWorkspaceId, workspaceId),
      ),
    )
    .limit(1);
  return row?.remoteUserId ?? null;
}

async function getLink(taskId: string) {
  const [link] = await db
    .select()
    .from(externalLinks)
    .where(
      and(
        eq(externalLinks.targetType, "task"),
        eq(externalLinks.targetId, taskId),
        eq(externalLinks.system, "asana"),
      ),
    )
    .limit(1);
  return link ?? null;
}

// ---- push ------------------------------------------------------------------------

type AsanaTask = {
  gid: string;
  name: string;
  completed: boolean;
  due_on?: string | null;
  modified_at?: string;
  permalink_url: string;
  assignee?: { gid: string } | null;
};
const FIELDS = "name,completed,due_on,modified_at,permalink_url,assignee.gid";

function isFinished(status: string) {
  return status === "done" || status === "dropped";
}

async function notesFor(row: TaskRow): Promise<string> {
  const place = await placeOfTask(row);
  const path = place.spot
    ? `/spots/${place.spot.spotId}`
    : place.siteId != null
      ? `/sites/${place.siteId}`
      : "";
  return [row.description, "", "---", `Managed in Placekeeping: ${appBaseUrl()}${path}`]
    .join("\n")
    .trim();
}

async function markSynced(taskId: string, at = new Date()) {
  await db
    .update(tasks)
    .set({
      externalSyncStatus: "synced",
      externalSyncError: null,
      externalSyncAttempts: 0,
      externalSyncedAt: at,
    })
    .where(eq(tasks.id, taskId));
}

async function markFailed(taskId: string, message: string) {
  await db
    .update(tasks)
    .set({
      externalSyncStatus: "failed",
      externalSyncError: message.slice(0, 500),
      externalSyncAttempts: sql`${tasks.externalSyncAttempts} + 1`,
    })
    .where(eq(tasks.id, taskId));
}

/**
 * Creates or updates the Asana copy of a native task. Safe to call after any
 * write: does nothing when Asana is off or the task's place has no binding.
 * `actingUserId` is the person who made the change (null from the job).
 */
export async function pushTask(taskId: string, actingUserId: string | null): Promise<void> {
  if (!isAsanaSyncEnabled()) return;
  const [row] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!row) return;
  try {
    const binding = await bindingForTask(row);
    if (!binding) return;
    const identity = await syncIdentity(binding, actingUserId);
    if (!identity) {
      await markFailed(
        taskId,
        "No connected Asana account can write to this project. Connect Asana to resume syncing.",
      );
      return;
    }

    const assignee = await remoteUserIdFor(row.assigneeUserId, binding.remoteWorkspaceId);
    const notes = await notesFor(row);
    const link = await getLink(taskId);
    let task: AsanaTask;

    if (link) {
      task = await asanaRequest<AsanaTask>(identity, `/tasks/${link.remoteId}?opt_fields=${FIELDS}`, {
        method: "PUT",
        body: {
          name: row.title,
          notes,
          completed: isFinished(row.status),
          due_on: row.dueOn,
          assignee,
        },
      });
    } else {
      task = await asanaRequest<AsanaTask>(identity, `/tasks?opt_fields=${FIELDS}`, {
        method: "POST",
        body: {
          name: row.title,
          notes,
          projects: [binding.remoteProjectId],
          completed: isFinished(row.status),
          ...(assignee ? { assignee } : {}),
          ...(row.dueOn ? { due_on: row.dueOn } : {}),
        },
      });
      if (binding.remoteSectionId) {
        await asanaRequest(identity, `/sections/${binding.remoteSectionId}/addTask`, {
          method: "POST",
          body: { task: task.gid },
        }).catch(() => undefined);
      }
      await db.insert(externalLinks).values({
        targetType: "task",
        targetId: taskId,
        system: "asana",
        remoteType: "task",
        remoteId: task.gid,
        remoteUrl: task.permalink_url,
        cachedTitle: task.name,
        cachedStatus: task.completed ? "done" : "open",
        cachedAt: new Date(),
        createdBy: actingUserId,
      });
    }

    if (link) {
      await db
        .update(externalLinks)
        .set({
          cachedTitle: task.name,
          cachedStatus: task.completed ? "done" : "open",
          cachedAt: new Date(),
        })
        .where(eq(externalLinks.id, link.id));
    }
    await markSynced(taskId);
  } catch (err) {
    console.error("[taskSync] push failed:", taskId, err);
    await markFailed(taskId, err instanceof Error ? err.message : String(err));
  }
}

// Prefix on every comment we post to Asana. Used when pulling to recognise our
// own comments even if recording the story id failed.
const PUSHED_PREFIX = /^@\S+ \(Placekeeping\): /;

/**
 * Copies a native comment to the Asana task, credited to its author, and
 * records the Asana story id on the comment so a pull never copies it back.
 */
export async function pushComment(
  taskId: string,
  commentId: string,
  authorUserId: string,
  text: string,
): Promise<void> {
  if (!isAsanaSyncEnabled()) return;
  try {
    const [row] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
    const link = await getLink(taskId);
    if (!row || !link) return;
    const binding = await bindingForTask(row);
    if (!binding) return;
    const identity = await syncIdentity(binding, authorUserId);
    if (!identity) return;
    const [author] = await db
      .select({ username: users.username })
      .from(users)
      .where(eq(users.userId, authorUserId))
      .limit(1);
    const story = await asanaRequest<{ gid: string }>(
      identity,
      `/tasks/${link.remoteId}/stories`,
      {
        method: "POST",
        body: { text: `@${author?.username ?? "member"} (Placekeeping): ${text}` },
      },
    );
    await db
      .update(taskComments)
      .set({ externalId: story.gid })
      .where(eq(taskComments.id, commentId));
  } catch (err) {
    // Comments are best-effort and not retried.
    console.error("[taskSync] comment push failed:", taskId, err);
  }
}

/**
 * A deleted native task is not deleted in Asana (too destructive to do
 * automatically): its Asana copy is completed and renamed so it is clear why.
 * Call with the row as it was before deletion.
 */
export async function retireTask(row: TaskRow, actingUserId: string | null): Promise<void> {
  if (!isAsanaSyncEnabled()) return;
  try {
    const link = await getLink(row.id);
    if (!link) return;
    const binding = await bindingForTask(row);
    if (binding) {
      const identity = await syncIdentity(binding, actingUserId);
      if (identity) {
        await asanaRequest(identity, `/tasks/${link.remoteId}`, {
          method: "PUT",
          body: { name: `[Deleted in Placekeeping] ${row.title}`, completed: true },
        });
      }
    }
    await db.delete(externalLinks).where(eq(externalLinks.id, link.id));
  } catch (err) {
    console.error("[taskSync] retire failed:", row.id, err);
  }
}

// ---- pull ------------------------------------------------------------------------

async function pullTask(row: TaskRow): Promise<"changed" | "unchanged" | "pushed" | "skipped"> {
  const link = await getLink(row.id);
  const binding = await bindingForTask(row);
  if (!link || !binding) return "skipped";
  const identity = await syncIdentity(binding, null);
  if (!identity) return "skipped";

  const remote = await asanaRequest<AsanaTask>(
    identity,
    `/tasks/${link.remoteId}?opt_fields=${FIELDS}`,
  );
  const syncedAt = row.externalSyncedAt;
  const remoteModified = remote.modified_at ? new Date(remote.modified_at) : null;
  const remoteChanged =
    !syncedAt || !remoteModified || remoteModified.getTime() > syncedAt.getTime() + SKEW_MS;
  if (!remoteChanged) return "unchanged";

  // Both sides edited since they last agreed: native wins.
  const nativeChanged = !!syncedAt && row.updatedAt.getTime() > syncedAt.getTime();
  if (nativeChanged) {
    await pushTask(row.id, null);
    return "pushed";
  }

  const now = new Date();
  const set: Partial<typeof tasks.$inferInsert> = {};
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  const note = (key: string, from: unknown, to: unknown) => {
    changes[key] = { from, to };
  };

  if (remote.name && remote.name !== row.title) {
    set.title = remote.name;
    note("title", row.title, remote.name);
  }
  const remoteDue = remote.due_on ?? null;
  if (remoteDue !== row.dueOn) {
    set.dueOn = remoteDue;
    note("dueOn", row.dueOn, remoteDue);
  }
  // Native "dropped" is mirrored as completed, so it is never re-opened here.
  if (remote.completed && (row.status === "open" || row.status === "in_progress")) {
    set.status = "done";
    set.completedAt = now;
    note("status", row.status, "done");
  } else if (!remote.completed && row.status === "done") {
    set.status = "open";
    set.completedAt = null;
    set.completedBy = null;
    note("status", "done", "open");
  }
  if (remote.assignee === null || remote.assignee === undefined) {
    if (row.assigneeUserId !== null && remote.assignee === null) {
      set.assigneeUserId = null;
      note("assigneeUserId", row.assigneeUserId, null);
    }
  } else {
    const [match] = await db
      .select({ userId: externalIdentities.userId })
      .from(externalIdentities)
      .innerJoin(users, eq(users.userId, externalIdentities.userId))
      .where(
        and(
          eq(externalIdentities.system, "asana"),
          eq(externalIdentities.remoteWorkspaceId, binding.remoteWorkspaceId),
          eq(externalIdentities.remoteUserId, remote.assignee.gid),
          sql`${users.level} >= 1`,
        ),
      )
      .limit(1);
    // An Asana assignee who isn't a Placekeeping member leaves ours as is.
    if (match && match.userId !== row.assigneeUserId) {
      set.assigneeUserId = match.userId;
      note("assigneeUserId", row.assigneeUserId, match.userId);
    }
  }

  await db
    .update(externalLinks)
    .set({
      cachedTitle: remote.name,
      cachedStatus: remote.completed ? "done" : "open",
      cachedAt: now,
    })
    .where(eq(externalLinks.id, link.id));

  if (Object.keys(changes).length === 0) {
    await markSynced(row.id, now);
    return "unchanged";
  }
  await db.transaction(async (tx) => {
    // updatedAt and externalSyncedAt share `now`, so this is not seen as a
    // native edit on the next pull.
    await tx
      .update(tasks)
      .set({
        ...set,
        updatedAt: now,
        externalSyncStatus: "synced",
        externalSyncError: null,
        externalSyncAttempts: 0,
        externalSyncedAt: now,
      })
      .where(eq(tasks.id, row.id));
    await logEvent(
      {
        entityType: "task",
        entityId: row.id,
        action: "update",
        userId: null,
        changes: { ...changes, source: { from: null, to: "asana" } },
      },
      tx,
    );
  });
  return "changed";
}

type AsanaStory = {
  gid: string;
  created_at: string;
  text: string;
  resource_subtype: string;
  created_by?: { gid: string; name: string } | null;
};

/**
 * Imports Asana comments that are not yet native comments. Our own pushed
 * comments are skipped (by recorded story id, or by their prefix). The author
 * is matched to a Placekeeping member through their linked Asana identity;
 * otherwise the comment is kept with the Asana display name. Returns how
 * many were added.
 */
async function pullComments(row: TaskRow): Promise<number> {
  const link = await getLink(row.id);
  const binding = await bindingForTask(row);
  if (!link || !binding) return 0;
  const identity = await syncIdentity(binding, null);
  if (!identity) return 0;

  const stories = await asanaRequest<AsanaStory[]>(
    identity,
    `/tasks/${link.remoteId}/stories?opt_fields=created_at,text,resource_subtype,created_by.name,created_by.gid&limit=100`,
  );
  const comments = stories.filter(
    (s) => s.resource_subtype === "comment_added" && s.text && !PUSHED_PREFIX.test(s.text),
  );
  if (comments.length === 0) return 0;

  const known = new Set(
    (
      await db
        .select({ externalId: taskComments.externalId })
        .from(taskComments)
        .where(eq(taskComments.taskId, row.id))
    )
      .map((c) => c.externalId)
      .filter((id): id is string => !!id),
  );

  let added = 0;
  for (const story of comments) {
    if (known.has(story.gid)) continue;
    let userId: string | null = null;
    if (story.created_by?.gid) {
      const [match] = await db
        .select({ userId: externalIdentities.userId })
        .from(externalIdentities)
        .where(
          and(
            eq(externalIdentities.system, "asana"),
            eq(externalIdentities.remoteWorkspaceId, binding.remoteWorkspaceId),
            eq(externalIdentities.remoteUserId, story.created_by.gid),
          ),
        )
        .limit(1);
      userId = match?.userId ?? null;
    }
    await db.transaction(async (tx) => {
      // The unique (task, external id) index makes a concurrent run a no-op.
      const [inserted] = await tx
        .insert(taskComments)
        .values({
          taskId: row.id,
          userId,
          body: story.text,
          createdAt: new Date(story.created_at),
          externalId: story.gid,
          externalAuthor: story.created_by?.name ?? null,
        })
        .onConflictDoNothing()
        .returning({ id: taskComments.id });
      if (!inserted) return;
      added++;
      await logEvent(
        {
          entityType: "task_comment",
          entityId: inserted.id,
          action: "create",
          userId,
          changes: {
            taskId: { from: null, to: row.id },
            source: { from: null, to: "asana" },
          },
        },
        tx,
      );
    });
  }
  return added;
}

// ---- job -------------------------------------------------------------------------

/**
 * One scheduler tick (run roughly hourly): retries pending and failed
 * pushes, then pulls Asana-side edits for synced tasks. Safe to repeat.
 */
export async function runTaskSync() {
  const result = { pushed: 0, pulled: 0, unchanged: 0, failed: 0, commentsAdded: 0 };
  if (!isAsanaSyncEnabled()) return result;

  const toPush = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(
      and(
        inArray(tasks.externalSyncStatus, ["pending", "failed"]),
        sql`${tasks.externalSyncAttempts} < ${MAX_ATTEMPTS}`,
      ),
    )
    .orderBy(asc(tasks.updatedAt))
    .limit(PUSH_BATCH);
  for (const { id } of toPush) {
    await pushTask(id, null);
    result.pushed++;
  }

  // Oldest-synced first, and only work that can still change.
  const toPull = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.externalSyncStatus, "synced"),
        or(
          inArray(tasks.status, ["open", "in_progress"]),
          sql`${tasks.updatedAt} > now() - interval '30 days'`,
        ),
      ),
    )
    .orderBy(asc(tasks.externalSyncedAt))
    .limit(PULL_BATCH);
  for (const row of toPull) {
    try {
      const outcome = await pullTask(row);
      if (outcome === "changed") result.pulled++;
      else result.unchanged++;
    } catch (err) {
      result.failed++;
      console.error("[taskSync] pull failed:", row.id, err);
    }
    // Checked every run: a new comment may not change the task's modified_at.
    try {
      result.commentsAdded += await pullComments(row);
    } catch (err) {
      result.failed++;
      console.error("[taskSync] comment pull failed:", row.id, err);
    }
  }
  return result;
}

/**
 * Marks tasks at a newly bound place (not yet mirrored) as pending, then
 * pushes a first batch right away; the job does the rest. Returns how many
 * were queued.
 */
export async function queueExistingTasks(
  scope: BindingScope,
  actingUserId: string,
): Promise<number> {
  if (!isAsanaSyncEnabled()) return 0;
  const spotIds = (
    await db
      .select({ spotId: spots.spotId })
      .from(spots)
      .where(
        "stewardId" in scope
          ? eq(spots.stewardId, scope.stewardId)
          : "siteId" in scope
            ? eq(spots.siteId, scope.siteId)
            : eq(spots.spotId, scope.spotId),
      )
  ).map((s) => s.spotId);

  const parts = [];
  if (spotIds.length > 0) {
    parts.push(
      inArray(tasks.spotId, spotIds),
      inArray(
        tasks.observationId,
        db
          .select({ id: observations.observationId })
          .from(observations)
          .where(inArray(observations.spotId, spotIds)),
      ),
      inArray(
        tasks.eventId,
        db.select({ id: careEvents.id }).from(careEvents).where(inArray(careEvents.spotId, spotIds)),
      ),
    );
  }
  if ("siteId" in scope) {
    parts.push(
      eq(tasks.siteId, scope.siteId),
      inArray(
        tasks.eventId,
        db.select({ id: careEvents.id }).from(careEvents).where(eq(careEvents.siteId, scope.siteId)),
      ),
    );
  }
  if (parts.length === 0) return 0;

  const queued = await db
    .update(tasks)
    .set({ externalSyncStatus: "pending", externalSyncAttempts: 0 })
    .where(and(isNull(tasks.externalSyncStatus), or(...parts)))
    .returning({ id: tasks.id });

  for (const { id } of queued.slice(0, 25)) await pushTask(id, actingUserId);
  return queued.length;
}
