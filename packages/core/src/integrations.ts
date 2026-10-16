import {
  db,
  externalIdentities,
  externalLinks,
  integrationBindings,
  spots,
} from "@placekeeping/db";
import { and, eq } from "drizzle-orm";
import { AsanaApiError, asanaRequest } from "./asanaClient";
import type { ExternalIdentityRow } from "./asanaClient";
import { getStewardByStewardId } from "./stewards";

// The adapter surface from local/asana-integration.md. Only Asana implements
// it for now; the functions below are the Asana implementation.

export class IntegrationError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "IntegrationError";
  }
}

/** Maps Asana API failures to the HTTP-friendly IntegrationError. */
async function asana<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof AsanaApiError) {
      const status = err.status === 401 || err.status === 403 ? err.status : 502;
      throw new IntegrationError(
        status,
        status === 403
          ? `Asana says you don't have access: ${err.message}`
          : err.message,
      );
    }
    throw err;
  }
}

// ---- identities ---------------------------------------------------------

// Never returns token columns.
export async function listAsanaIdentitiesForUser(userId: string) {
  return db
    .select({
      id: externalIdentities.id,
      remoteWorkspaceId: externalIdentities.remoteWorkspaceId,
      remoteWorkspaceName: externalIdentities.remoteWorkspaceName,
      remoteUserName: externalIdentities.remoteUserName,
      status: externalIdentities.status,
    })
    .from(externalIdentities)
    .where(
      and(
        eq(externalIdentities.userId, userId),
        eq(externalIdentities.system, "asana"),
      ),
    );
}

export async function disconnectAsana(userId: string) {
  await db
    .delete(externalIdentities)
    .where(
      and(
        eq(externalIdentities.userId, userId),
        eq(externalIdentities.system, "asana"),
      ),
    );
}

async function getIdentityForWorkspace(
  userId: string,
  workspaceId: string,
): Promise<ExternalIdentityRow> {
  const [row] = await db
    .select()
    .from(externalIdentities)
    .where(
      and(
        eq(externalIdentities.userId, userId),
        eq(externalIdentities.system, "asana"),
        eq(externalIdentities.remoteWorkspaceId, workspaceId),
        eq(externalIdentities.status, "active"),
      ),
    )
    .limit(1);
  if (!row) {
    throw new IntegrationError(
      403,
      "Your Placekeeping account isn't connected to that Asana workspace.",
    );
  }
  return row;
}

async function getIdentityById(userId: string, identityId: string) {
  const [row] = await db
    .select()
    .from(externalIdentities)
    .where(
      and(
        eq(externalIdentities.id, identityId),
        eq(externalIdentities.userId, userId),
      ),
    )
    .limit(1);
  if (!row) throw new IntegrationError(404, "Asana connection not found.");
  return row;
}

// ---- browsing Asana (for the binding picker) -----------------------------

export async function listAsanaProjects(userId: string, identityId: string) {
  const identity = await getIdentityById(userId, identityId);
  return asana(() =>
    asanaRequest<{ gid: string; name: string }[]>(
      identity,
      `/projects?workspace=${identity.remoteWorkspaceId}&archived=false&limit=100&opt_fields=name`,
    ),
  );
}

export async function listAsanaSections(
  userId: string,
  identityId: string,
  projectId: string,
) {
  const identity = await getIdentityById(userId, identityId);
  return asana(() =>
    asanaRequest<{ gid: string; name: string }[]>(
      identity,
      `/projects/${encodeURIComponent(projectId)}/sections?opt_fields=name`,
    ),
  );
}

// ---- bindings -------------------------------------------------------------

export type BindingRow = typeof integrationBindings.$inferSelect;

export type BindingScope =
  | { stewardId: string }
  | { siteId: number }
  | { spotId: number };

function scopeWhere(scope: BindingScope) {
  const target =
    "stewardId" in scope
      ? eq(integrationBindings.stewardId, scope.stewardId)
      : "siteId" in scope
        ? eq(integrationBindings.siteId, scope.siteId)
        : eq(integrationBindings.spotId, scope.spotId);
  return and(target, eq(integrationBindings.system, "asana"));
}

export async function getBinding(scope: BindingScope) {
  const [row] = await db
    .select()
    .from(integrationBindings)
    .where(scopeWhere(scope))
    .limit(1);
  return row ?? null;
}

export type BindingSource = "spot" | "site" | "steward";

// Most specific wins: the spot's own binding, then its site's, then its
// steward's default.
export async function getEffectiveBinding(spot: {
  spotId: number;
  siteId: number | null;
  stewardId: string | null;
}): Promise<{ binding: BindingRow; source: BindingSource } | null> {
  const own = await getBinding({ spotId: spot.spotId });
  if (own) return { binding: own, source: "spot" };
  if (spot.siteId != null) {
    const site = await getBinding({ siteId: spot.siteId });
    if (site) return { binding: site, source: "site" };
  }
  if (spot.stewardId) {
    const steward = await getBinding({ stewardId: spot.stewardId });
    if (steward) return { binding: steward, source: "steward" };
  }
  return null;
}

export async function setBinding(input: {
  scope: BindingScope;
  userId: string;
  identityId: string;
  remoteProjectId: string;
  remoteSectionId: string | null;
}) {
  const identity = await getIdentityById(input.userId, input.identityId);
  // Look the project up as the user: confirms access and gets the real name.
  const project = await asana(() =>
    asanaRequest<{ gid: string; name: string }>(
      identity,
      `/projects/${encodeURIComponent(input.remoteProjectId)}?opt_fields=name`,
    ),
  );
  await clearBinding(input.scope);
  await db.insert(integrationBindings).values({
    siteId: "siteId" in input.scope ? input.scope.siteId : null,
    spotId: "spotId" in input.scope ? input.scope.spotId : null,
    stewardId: "stewardId" in input.scope ? input.scope.stewardId : null,
    system: "asana",
    remoteWorkspaceId: identity.remoteWorkspaceId,
    remoteProjectId: project.gid,
    remoteProjectName: project.name,
    remoteSectionId: input.remoteSectionId,
    configuredBy: input.userId,
  });
}

export async function clearBinding(scope: BindingScope) {
  await db.delete(integrationBindings).where(scopeWhere(scope));
}

// ---- tasks ----------------------------------------------------------------

type AsanaTask = {
  gid: string;
  name: string;
  completed: boolean;
  permalink_url: string;
};

const TASK_FIELDS = "name,completed,permalink_url";

export async function createTaskForSpot(input: {
  userId: string;
  spotId: number;
  observationId: string | null;
  name: string;
  notes: string;
  dueOn: string | null;
  photoUrl: string | null;
}) {
  const [spot] = await db
    .select({
      spotId: spots.spotId,
      siteId: spots.siteId,
      stewardId: spots.stewardId,
    })
    .from(spots)
    .where(eq(spots.spotId, input.spotId))
    .limit(1);
  if (!spot) throw new IntegrationError(404, "Spot not found.");

  const effective = await getEffectiveBinding(spot);
  if (!effective) {
    throw new IntegrationError(400, "This spot isn't bound to an Asana project.");
  }
  const { binding } = effective;
  const identity = await getIdentityForWorkspace(
    input.userId,
    binding.remoteWorkspaceId,
  );

  // Default assignee: the spot's keeper, when they've linked Asana in this
  // workspace. Otherwise the task is left unassigned.
  let assignee: string | null = null;
  const steward = await getStewardByStewardId(spot.stewardId);
  if (steward?.userId) {
    const [keeperIdentity] = await db
      .select({ remoteUserId: externalIdentities.remoteUserId })
      .from(externalIdentities)
      .where(
        and(
          eq(externalIdentities.userId, steward.userId),
          eq(externalIdentities.system, "asana"),
          eq(externalIdentities.remoteWorkspaceId, binding.remoteWorkspaceId),
        ),
      )
      .limit(1);
    assignee = keeperIdentity?.remoteUserId ?? null;
  }

  const task = await asana(() =>
    asanaRequest<AsanaTask>(identity, `/tasks?opt_fields=${TASK_FIELDS}`, {
      method: "POST",
      body: {
        name: input.name,
        notes: input.notes,
        projects: [binding.remoteProjectId],
        ...(assignee ? { assignee } : {}),
        ...(input.dueOn ? { due_on: input.dueOn } : {}),
      },
    }),
  );

  // Best-effort extras: a failure here shouldn't lose the created task.
  if (binding.remoteSectionId) {
    await asana(() =>
      asanaRequest(identity, `/sections/${binding.remoteSectionId}/addTask`, {
        method: "POST",
        body: { task: task.gid },
      }),
    ).catch(() => undefined);
  }
  if (input.photoUrl) {
    await asana(() =>
      asanaRequest(identity, "/attachments", {
        method: "POST",
        body: {
          parent: task.gid,
          resource_subtype: "external",
          name: "Observation photo",
          url: input.photoUrl,
        },
      }),
    ).catch(() => undefined);
  }

  // One link row, tagged to the spot (what the panel lists). The observation
  // that prompted it, if any, is recorded in a second row.
  const base = {
    system: "asana",
    remoteType: "task",
    remoteId: task.gid,
    remoteUrl: task.permalink_url,
    cachedTitle: task.name,
    cachedStatus: task.completed ? "done" : "open",
    cachedAt: new Date(),
    createdBy: input.userId,
  };
  const [link] = await db
    .insert(externalLinks)
    .values({ ...base, targetType: "spot", targetId: String(input.spotId) })
    .returning();
  if (input.observationId) {
    await db
      .insert(externalLinks)
      .values({ ...base, targetType: "observation", targetId: input.observationId });
  }
  return link;
}

// Linked tasks for a spot. When the user is connected to the binding's
// workspace, titles/status are refreshed from Asana (no webhooks yet);
// otherwise the cached values are returned.
export async function listTaskLinksForSpot(
  spot: { spotId: number; siteId: number | null; stewardId: string | null },
  userId: string,
) {
  const links = await db
    .select()
    .from(externalLinks)
    .where(
      and(
        eq(externalLinks.targetType, "spot"),
        eq(externalLinks.targetId, String(spot.spotId)),
        eq(externalLinks.system, "asana"),
      ),
    );
  if (links.length === 0) return links;

  const effective = await getEffectiveBinding(spot);
  const [identity] = await db
    .select()
    .from(externalIdentities)
    .where(
      and(
        eq(externalIdentities.userId, userId),
        eq(externalIdentities.system, "asana"),
        eq(externalIdentities.status, "active"),
        ...(effective
          ? [eq(externalIdentities.remoteWorkspaceId, effective.binding.remoteWorkspaceId)]
          : []),
      ),
    )
    .limit(1);
  if (!identity) return links;

  return Promise.all(
    links.map(async (link) => {
      try {
        const task = await asanaRequest<AsanaTask>(
          identity,
          `/tasks/${link.remoteId}?opt_fields=${TASK_FIELDS}`,
        );
        const cachedStatus = task.completed ? "done" : "open";
        if (task.name !== link.cachedTitle || cachedStatus !== link.cachedStatus) {
          await db
            .update(externalLinks)
            .set({ cachedTitle: task.name, cachedStatus, cachedAt: new Date() })
            .where(eq(externalLinks.id, link.id));
        }
        return { ...link, cachedTitle: task.name, cachedStatus };
      } catch {
        return link;
      }
    }),
  );
}

// ---- discussion -------------------------------------------------------------

async function getLinkAndIdentities(userId: string, linkId: string) {
  const [link] = await db
    .select()
    .from(externalLinks)
    .where(and(eq(externalLinks.id, linkId), eq(externalLinks.remoteType, "task")))
    .limit(1);
  if (!link) throw new IntegrationError(404, "Linked task not found.");
  const identities = await db
    .select()
    .from(externalIdentities)
    .where(
      and(
        eq(externalIdentities.userId, userId),
        eq(externalIdentities.system, "asana"),
        eq(externalIdentities.status, "active"),
      ),
    );
  if (identities.length === 0) {
    throw new IntegrationError(403, "Connect your Asana account first.");
  }
  return { link, identities };
}

// Links carry no workspace column by design, so try each of the user's
// identities until one can see the task.
async function withTaskAccess<T>(
  userId: string,
  linkId: string,
  call: (identity: ExternalIdentityRow, taskGid: string) => Promise<T>,
): Promise<T> {
  const { link, identities } = await getLinkAndIdentities(userId, linkId);
  let lastError: unknown;
  for (const identity of identities) {
    try {
      return await call(identity, link.remoteId);
    } catch (err) {
      lastError = err;
    }
  }
  return asana(() => Promise.reject(lastError));
}

export type AsanaTaskComment = {
  gid: string;
  author: string;
  text: string;
  createdAt: string;
};

export async function listTaskComments(userId: string, linkId: string) {
  return withTaskAccess(userId, linkId, async (identity, taskGid) => {
    const stories = await asanaRequest<
      {
        gid: string;
        created_at: string;
        text: string;
        resource_subtype: string;
        created_by?: { name: string };
      }[]
    >(
      identity,
      `/tasks/${taskGid}/stories?opt_fields=created_at,text,resource_subtype,created_by.name&limit=100`,
    );
    return stories
      .filter((s) => s.resource_subtype === "comment_added")
      .map<AsanaTaskComment>((s) => ({
        gid: s.gid,
        author: s.created_by?.name ?? "Unknown",
        text: s.text,
        createdAt: s.created_at,
      }));
  });
}

export async function postTaskComment(
  userId: string,
  linkId: string,
  text: string,
) {
  await withTaskAccess(userId, linkId, (identity, taskGid) =>
    asanaRequest(identity, `/tasks/${taskGid}/stories`, {
      method: "POST",
      body: { text },
    }),
  );
}

// ---- single-task read/update ------------------------------------------------

export type AsanaTaskPatch = {
  title?: string;
  notes?: string;
  done?: boolean;
  // null clears the due date.
  dueOn?: string | null;
};

export type AsanaTaskDetail = {
  linkId: string;
  title: string;
  notes: string;
  done: boolean;
  dueOn: string | null;
  assigneeName: string | null;
  url: string;
};

const DETAIL_FIELDS = "name,notes,completed,due_on,permalink_url,assignee.name";

type AsanaTaskFull = AsanaTask & {
  notes?: string;
  due_on?: string | null;
  assignee?: { name: string } | null;
};

function toDetail(linkId: string, task: AsanaTaskFull): AsanaTaskDetail {
  return {
    linkId,
    title: task.name,
    notes: task.notes ?? "",
    done: task.completed,
    dueOn: task.due_on ?? null,
    assigneeName: task.assignee?.name ?? null,
    url: task.permalink_url,
  };
}

async function refreshLinkCache(linkId: string, task: AsanaTaskFull) {
  await db
    .update(externalLinks)
    .set({
      cachedTitle: task.name,
      cachedStatus: task.completed ? "done" : "open",
      cachedAt: new Date(),
    })
    .where(eq(externalLinks.id, linkId));
}

/** Reads one linked task as the user and refreshes the cached title/status. */
export async function getTaskForLink(userId: string, linkId: string) {
  const task = await withTaskAccess(userId, linkId, (identity, gid) =>
    asanaRequest<AsanaTaskFull>(identity, `/tasks/${gid}?opt_fields=${DETAIL_FIELDS}`),
  );
  await refreshLinkCache(linkId, task);
  return toDetail(linkId, task);
}

/** Edits a linked task as the user, so Asana's own permissions apply. */
export async function updateTaskForLink(
  userId: string,
  linkId: string,
  patch: AsanaTaskPatch,
) {
  const body: Record<string, unknown> = {};
  if (patch.title !== undefined) body.name = patch.title;
  if (patch.notes !== undefined) body.notes = patch.notes;
  if (patch.done !== undefined) body.completed = patch.done;
  if (patch.dueOn !== undefined) body.due_on = patch.dueOn;
  if (Object.keys(body).length === 0) return getTaskForLink(userId, linkId);

  const task = await withTaskAccess(userId, linkId, (identity, gid) =>
    asanaRequest<AsanaTaskFull>(identity, `/tasks/${gid}?opt_fields=${DETAIL_FIELDS}`, {
      method: "PUT",
      body,
    }),
  );
  await refreshLinkCache(linkId, task);
  return toDetail(linkId, task);
}

// ---- suggestions --------------------------------------------------------------

// Hardcoded stand-in for the future rules engine (see "Deferred" in the
// design doc): marks where seasonal suggestions will plug in.
export function seasonalTip(now = new Date()): string {
  const month = now.getMonth() + 1;
  if (month >= 5 && month <= 8) {
    return "Seasonal tip: cut woody vines like bittersweet at the base before they set fruit.";
  }
  if (month >= 9 && month <= 11) {
    return "Seasonal tip: bag bittersweet berries before pulling vines so seeds don't spread.";
  }
  return "Seasonal tip: the dormant season is a good time to cut back invasive shrubs.";
}

// Occluding or Overwhelmed overgrowth (see OVERGROWTH_LABELS).
export function shouldSuggestTask(weedLevel: string | null | undefined) {
  return weedLevel === "thick" || weedLevel === "overtaken";
}
