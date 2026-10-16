import {
  db,
  externalLinks,
  observations,
  taskComments,
  tasks,
  users,
} from "@placekeeping/db";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import {
  canManageEvent,
  isTaskMember,
  type AuthContext,
  type CareEventTarget,
} from "./auth";
import { getCareEvent, loadManageTarget } from "./careEvents";
import { diffFields, logEvent, snapshotToChanges } from "./events";
import { IntegrationError } from "./integrations";
import { DAY_MS, enforceRateLimit, HOUR_MS } from "./rateLimit";
import { pushComment, pushTask, retireTask } from "./taskSync";
import {
  type CreateTaskInput,
  type TaskComment,
  type TaskDetail,
  type TaskProvider,
  type TaskStatus,
  type TaskSummary,
  type TaskSyncStatus,
  type TaskTarget,
  type UpdateTaskPatch,
} from "./taskTypes";

// Native tasks, stored in the tasks/task_comments tables. Permissions:
//  - any verified member can create a task and comment;
//  - the creator, the assignee, and managers of the place can edit/complete;
//  - only managers can delete a task, or reassign someone else's;
//  - dropping keeps the task in history, deleting removes it.
// "Managers" are whoever canManageEvent says for the task's place (a site's
// manager or a manager of any of its spots, or a spot's steward/creator).

const NATIVE_STATUSES = ["open", "in_progress", "done", "dropped"] as const;

type TaskRow = typeof tasks.$inferSelect;

function forbidden(message = "You can't do that with this task.") {
  return new IntegrationError(403, message);
}

function requireMember(auth: AuthContext) {
  if (!isTaskMember(auth)) {
    throw forbidden("Tasks are available to verified members.");
  }
}

// ---- targets and permissions ------------------------------------------------

type PlaceRef = { siteId: number | null; spotId: number | null };

// The site/spot whose managers manage a task on this target. An observation
// resolves through its spot, an event through its own target.
async function placeOfTarget(target: TaskTarget): Promise<PlaceRef> {
  switch (target.type) {
    case "site":
      return { siteId: target.siteId, spotId: null };
    case "spot":
      return { siteId: null, spotId: target.spotId };
    case "observation": {
      const [obs] = await db
        .select({ spotId: observations.spotId })
        .from(observations)
        .where(eq(observations.observationId, target.observationId))
        .limit(1);
      if (!obs) throw new IntegrationError(404, "Observation not found.");
      return { siteId: null, spotId: obs.spotId };
    }
    case "event": {
      const event = await getCareEvent(target.eventId);
      if (!event) throw new IntegrationError(404, "Event not found.");
      return { siteId: event.siteId, spotId: event.spotId };
    }
  }
}

function targetOfRow(row: TaskRow): TaskTarget {
  if (row.spotId != null) return { type: "spot", spotId: row.spotId };
  if (row.siteId != null) return { type: "site", siteId: row.siteId };
  if (row.observationId) return { type: "observation", observationId: row.observationId };
  return { type: "event", eventId: row.eventId as string };
}

async function loadPlaceTarget(place: PlaceRef): Promise<CareEventTarget> {
  const loaded = await loadManageTarget(place);
  if (!loaded) throw new IntegrationError(404, "Place not found.");
  return loaded;
}

async function isManagerOf(auth: AuthContext, target: TaskTarget): Promise<boolean> {
  return canManageEvent(auth, await loadPlaceTarget(await placeOfTarget(target)));
}

function canEditTask(auth: AuthContext, row: TaskRow, isManager: boolean) {
  return (
    isManager || row.createdBy === auth.userId || row.assigneeUserId === auth.userId
  );
}

// ---- helpers ----------------------------------------------------------------

function targetColumns(target: TaskTarget) {
  return {
    siteId: target.type === "site" ? target.siteId : null,
    spotId: target.type === "spot" ? target.spotId : null,
    observationId: target.type === "observation" ? target.observationId : null,
    eventId: target.type === "event" ? target.eventId : null,
  };
}

function targetWhere(target: TaskTarget) {
  switch (target.type) {
    case "site":
      return eq(tasks.siteId, target.siteId);
    case "spot":
      return eq(tasks.spotId, target.spotId);
    case "observation":
      return eq(tasks.observationId, target.observationId);
    case "event":
      return eq(tasks.eventId, target.eventId);
  }
}

async function usernameOf(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const [u] = await db
    .select({ username: users.username })
    .from(users)
    .where(eq(users.userId, userId))
    .limit(1);
  return u?.username ?? null;
}

// The Asana copy's URL, when the task is mirrored.
async function asanaUrlOf(taskId: string): Promise<string | null> {
  const [link] = await db
    .select({ remoteUrl: externalLinks.remoteUrl })
    .from(externalLinks)
    .where(
      and(
        eq(externalLinks.targetType, "task"),
        eq(externalLinks.targetId, taskId),
        eq(externalLinks.system, "asana"),
      ),
    )
    .limit(1);
  return link?.remoteUrl ?? null;
}

function toSummary(
  row: TaskRow,
  assigneeName: string | null,
  url: string | null = null,
): TaskSummary {
  return {
    id: row.id,
    provider: "native",
    title: row.title,
    status: row.status as TaskStatus,
    dueOn: row.dueOn,
    assigneeUserId: row.assigneeUserId,
    assigneeName,
    url,
    syncStatus: (row.externalSyncStatus as TaskSyncStatus | null) ?? null,
  };
}

async function toDetail(
  auth: AuthContext,
  row: TaskRow,
  isManager: boolean,
): Promise<TaskDetail> {
  return {
    ...toSummary(row, await usernameOf(row.assigneeUserId), await asanaUrlOf(row.id)),
    description: row.description,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    canEdit: canEditTask(auth, row, isManager),
    canDelete: isManager,
  };
}

async function getRow(id: string): Promise<TaskRow> {
  const [row] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
  if (!row) throw new IntegrationError(404, "Task not found.");
  return row;
}

// Assignment rules: a member may assign themselves or clear their own
// assignment; only managers may assign someone else or change/clear an
// assignment that isn't theirs. Assignees must themselves be verified.
async function checkAssignment(
  auth: AuthContext,
  current: string | null,
  next: string | null,
  isManager: boolean,
) {
  if (next === current) return;
  if (current && current !== auth.userId && !isManager) {
    throw forbidden("Only a steward can reassign someone else's task.");
  }
  if (next && next !== auth.userId) {
    if (!isManager) throw forbidden("Only a steward can assign a task to someone else.");
    const [u] = await db
      .select({ level: users.level })
      .from(users)
      .where(eq(users.userId, next))
      .limit(1);
    if (!u || u.level < 1) {
      throw new IntegrationError(400, "Tasks can only be assigned to verified members.");
    }
  }
}

function completionFields(auth: AuthContext, from: TaskStatus, to: TaskStatus) {
  if (to === "done" && from !== "done") {
    return { completedAt: new Date(), completedBy: auth.userId };
  }
  if (to !== "done" && from === "done") {
    return { completedAt: null, completedBy: null };
  }
  return {};
}

// ---- provider -----------------------------------------------------------------

export const nativeTaskProvider: TaskProvider = {
  kind: "native",
  capabilities: {
    statuses: NATIVE_STATUSES,
    assignees: true,
    comments: true,
    dueDates: true,
    delete: true,
  },

  async listTasks(auth, target) {
    // A non-member simply sees nothing: tasks are never public.
    if (!isTaskMember(auth)) return [];
    const rows = await db
      .select({ task: tasks, assigneeName: users.username, asanaUrl: externalLinks.remoteUrl })
      .from(tasks)
      .leftJoin(users, eq(users.userId, tasks.assigneeUserId))
      .leftJoin(
        externalLinks,
        and(
          eq(externalLinks.targetType, "task"),
          eq(externalLinks.targetId, sql`${tasks.id}::text`),
          eq(externalLinks.system, "asana"),
        ),
      )
      .where(targetWhere(target))
      .orderBy(
        // Open work first, then done/dropped; soonest due first, undated last.
        sql`(${tasks.status} in ('done', 'dropped'))`,
        sql`${tasks.dueOn} asc nulls last`,
        desc(tasks.createdAt),
      )
      .limit(200);
    return rows.map((r) => toSummary(r.task, r.assigneeName, r.asanaUrl));
  },

  async getTask(auth, id) {
    requireMember(auth);
    const row = await getRow(id);
    return toDetail(auth, row, await isManagerOf(auth, targetOfRow(row)));
  },

  async createTask(auth, input: CreateTaskInput) {
    requireMember(auth);
    await enforceRateLimit("task-create", auth.userId, 60, DAY_MS);
    // Resolving the place also proves the target exists.
    const isManager = await isManagerOf(auth, input.target);
    await checkAssignment(auth, null, input.assigneeUserId, isManager);

    const sourceObservationId =
      input.observationId ??
      (input.target.type === "observation" ? input.target.observationId : null);

    const created = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(tasks)
        .values({
          ...targetColumns(input.target),
          title: input.title,
          description: input.description,
          dueOn: input.dueOn,
          assigneeUserId: input.assigneeUserId,
          createdBy: auth.userId,
          sourceType: sourceObservationId ? "observation" : null,
          sourceId: sourceObservationId,
        })
        .returning();
      await logEvent(
        {
          entityType: "task",
          entityId: row.id,
          action: "create",
          userId: auth.userId,
          changes: snapshotToChanges(
            {
              title: row.title,
              target: input.target,
              dueOn: row.dueOn,
              assigneeUserId: row.assigneeUserId,
              sourceId: row.sourceId,
            },
            "create",
          ),
        },
        tx,
      );
      return row;
    });
    // Mirror to Asana when the place is bound; never fails the request.
    await pushTask(created.id, auth.userId);
    const synced = await getRow(created.id);
    return toSummary(
      synced,
      await usernameOf(synced.assigneeUserId),
      await asanaUrlOf(synced.id),
    );
  },

  async updateTask(auth, id, patch: UpdateTaskPatch) {
    requireMember(auth);
    const before = await getRow(id);
    const isManager = await isManagerOf(auth, targetOfRow(before));
    if (!canEditTask(auth, before, isManager)) throw forbidden();

    if (patch.assigneeUserId !== undefined) {
      await checkAssignment(auth, before.assigneeUserId, patch.assigneeUserId, isManager);
    }
    const set = {
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.dueOn !== undefined ? { dueOn: patch.dueOn } : {}),
      ...(patch.assigneeUserId !== undefined
        ? { assigneeUserId: patch.assigneeUserId }
        : {}),
      ...(patch.status !== undefined
        ? {
            status: patch.status,
            ...completionFields(auth, before.status as TaskStatus, patch.status),
          }
        : {}),
    };

    const after = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(tasks)
        .set({ ...set, updatedAt: new Date() })
        .where(eq(tasks.id, id))
        .returning();
      const changes = diffFields(
        before as Record<string, unknown>,
        row as Record<string, unknown>,
        set,
      );
      if (changes) {
        await logEvent(
          { entityType: "task", entityId: id, action: "update", userId: auth.userId, changes },
          tx,
        );
      }
      return row;
    });
    await pushTask(id, auth.userId);
    return toDetail(auth, await getRow(after.id), isManager);
  },

  async deleteTask(auth, id) {
    requireMember(auth);
    const row = await getRow(id);
    if (!(await isManagerOf(auth, targetOfRow(row)))) {
      throw forbidden("Only a steward can delete a task. You can drop it instead.");
    }
    await db.transaction(async (tx) => {
      await tx.delete(tasks).where(eq(tasks.id, id));
      await logEvent(
        {
          entityType: "task",
          entityId: id,
          action: "delete",
          userId: auth.userId,
          changes: snapshotToChanges({ title: row.title, status: row.status }, "delete"),
        },
        tx,
      );
    });
    // The Asana copy is completed and renamed, not deleted.
    await retireTask(row, auth.userId);
  },

  async listComments(auth, id) {
    requireMember(auth);
    const row = await getRow(id);
    const isManager = await isManagerOf(auth, targetOfRow(row));
    const comments = await db
      .select({ comment: taskComments, username: users.username })
      .from(taskComments)
      .leftJoin(users, eq(users.userId, taskComments.userId))
      .where(eq(taskComments.taskId, id))
      .orderBy(asc(taskComments.createdAt));
    return comments.map<TaskComment>(({ comment, username }) => ({
      id: comment.id,
      userId: comment.userId,
      author:
        username ??
        (comment.externalAuthor ? `${comment.externalAuthor} (Asana)` : "Former member"),
      text: comment.body,
      createdAt: comment.createdAt.toISOString(),
      editedAt: comment.editedAt?.toISOString() ?? null,
      // Comments that exist in Asana too can't be edited here (the copy
      // would silently diverge).
      canEdit: comment.userId === auth.userId && !comment.externalId,
      canDelete: comment.userId === auth.userId || isManager,
    }));
  },

  async postComment(auth, id, text) {
    requireMember(auth);
    await getRow(id);
    await enforceRateLimit("task-comment", auth.userId, 60, HOUR_MS);
    let commentId = "";
    await db.transaction(async (tx) => {
      const [comment] = await tx
        .insert(taskComments)
        .values({ taskId: id, userId: auth.userId, body: text })
        .returning({ id: taskComments.id });
      commentId = comment.id;
      await logEvent(
        {
          entityType: "task_comment",
          entityId: comment.id,
          action: "create",
          userId: auth.userId,
          changes: snapshotToChanges({ taskId: id }, "create"),
        },
        tx,
      );
    });
    await pushComment(id, commentId, auth.userId, text);
  },

  // Only the author edits a comment: nobody else's words are rewritten.
  async editComment(auth, commentId, text) {
    requireMember(auth);
    const [existing] = await db
      .select()
      .from(taskComments)
      .where(eq(taskComments.id, commentId))
      .limit(1);
    if (!existing) throw new IntegrationError(404, "Comment not found.");
    if (existing.userId !== auth.userId) throw forbidden("You can only edit your own comments.");
    if (existing.externalId) {
      throw forbidden("This comment is shared with Asana and can't be edited here.");
    }
    await db.transaction(async (tx) => {
      await tx
        .update(taskComments)
        .set({ body: text, editedAt: new Date() })
        .where(eq(taskComments.id, commentId));
      await logEvent(
        {
          entityType: "task_comment",
          entityId: commentId,
          action: "update",
          userId: auth.userId,
          changes: { body: { from: existing.body, to: text } },
        },
        tx,
      );
    });
  },

  async deleteComment(auth, commentId) {
    requireMember(auth);
    const [existing] = await db
      .select()
      .from(taskComments)
      .where(eq(taskComments.id, commentId))
      .limit(1);
    if (!existing) throw new IntegrationError(404, "Comment not found.");
    if (existing.userId !== auth.userId) {
      const row = await getRow(existing.taskId);
      if (!(await isManagerOf(auth, targetOfRow(row)))) throw forbidden();
    }
    await db.transaction(async (tx) => {
      await tx.delete(taskComments).where(eq(taskComments.id, commentId));
      await logEvent(
        {
          entityType: "task_comment",
          entityId: commentId,
          action: "delete",
          userId: auth.userId,
          changes: snapshotToChanges({ taskId: existing.taskId }, "delete"),
        },
        tx,
      );
    });
  },
};
