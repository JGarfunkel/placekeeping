import { db, externalLinks, spots } from "@placekeeping/db";
import { and, eq } from "drizzle-orm";
import {
  createTaskForSpot,
  getTaskForLink,
  IntegrationError,
  listTaskComments,
  listTaskLinksForSpot,
  postTaskComment,
  updateTaskForLink,
  type AsanaTaskDetail,
} from "./integrations";
import {
  assertStatusSupported,
  type TaskDetail,
  type TaskProvider,
  type TaskSummary,
} from "./taskTypes";

// The Asana implementation of TaskProvider. It wraps the functions in
// integrations.ts; OAuth, bindings and link tables are unchanged. Tasks live
// in Asana, with external_links rows (and a cached title/status) here. Acts
// as the caller's linked Asana identity, so Asana enforces who may do what;
// canEdit/canDelete below are therefore advisory for the UI only.

const ASANA_STATUSES = ["open", "done"] as const;

function toSummary(link: {
  id: string;
  remoteUrl: string;
  cachedTitle: string | null;
  cachedStatus: string | null;
}): TaskSummary {
  return {
    id: link.id,
    provider: "asana",
    title: link.cachedTitle ?? "Asana task",
    status: link.cachedStatus === "done" ? "done" : "open",
    // The link cache doesn't hold these; getTask reads them live.
    dueOn: null,
    assigneeUserId: null,
    assigneeName: null,
    url: link.remoteUrl,
    syncStatus: null,
  };
}

function toDetail(d: AsanaTaskDetail): TaskDetail {
  return {
    id: d.linkId,
    provider: "asana",
    title: d.title,
    description: d.notes,
    status: d.done ? "done" : "open",
    dueOn: d.dueOn,
    assigneeUserId: null,
    assigneeName: d.assigneeName,
    url: d.url,
    syncStatus: null,
    createdBy: null,
    createdAt: null,
    completedAt: null,
    canEdit: true,
    canDelete: false,
  };
}

export const asanaTaskProvider: TaskProvider = {
  kind: "asana",
  capabilities: {
    statuses: ASANA_STATUSES,
    // New tasks default to the spot's keeper when they've linked Asana;
    // choosing a Placekeeping user as assignee isn't supported.
    assignees: false,
    comments: true,
    dueDates: true,
    delete: false,
  },

  async listTasks(auth, target) {
    if (target.type === "observation") {
      // Observation-tagged links are cache-only rows; no live refresh.
      const links = await db
        .select()
        .from(externalLinks)
        .where(
          and(
            eq(externalLinks.targetType, "observation"),
            eq(externalLinks.targetId, target.observationId),
            eq(externalLinks.system, "asana"),
          ),
        );
      return links.map(toSummary);
    }
    if (target.type !== "spot") return [];
    const [spot] = await db
      .select({ spotId: spots.spotId, siteId: spots.siteId, stewardId: spots.stewardId })
      .from(spots)
      .where(eq(spots.spotId, target.spotId))
      .limit(1);
    if (!spot) throw new IntegrationError(404, "Spot not found.");
    return (await listTaskLinksForSpot(spot, auth.userId)).map(toSummary);
  },

  async getTask(auth, id) {
    return toDetail(await getTaskForLink(auth.userId, id));
  },

  async createTask(auth, input) {
    if (input.target.type !== "spot") {
      throw new IntegrationError(400, "Asana tasks are created on a spot.");
    }
    if (input.assigneeUserId) {
      throw new IntegrationError(400, "Asana tasks can't be assigned from Placekeeping.");
    }
    const link = await createTaskForSpot({
      userId: auth.userId,
      spotId: input.target.spotId,
      observationId: input.observationId,
      name: input.title,
      notes: input.description,
      dueOn: input.dueOn,
      photoUrl: input.photoUrl,
    });
    return toSummary(link);
  },

  async updateTask(auth, id, patch) {
    if (patch.status !== undefined) assertStatusSupported(this, patch.status);
    if (patch.assigneeUserId !== undefined) {
      throw new IntegrationError(400, "Asana tasks can't be assigned from Placekeeping.");
    }
    return toDetail(
      await updateTaskForLink(auth.userId, id, {
        title: patch.title,
        notes: patch.description,
        done: patch.status === undefined ? undefined : patch.status === "done",
        dueOn: patch.dueOn,
      }),
    );
  },

  async listComments(auth, id) {
    const comments = await listTaskComments(auth.userId, id);
    return comments.map((c) => ({
      id: c.gid,
      userId: null,
      author: c.author,
      text: c.text,
      createdAt: c.createdAt,
      editedAt: null,
      canEdit: false,
      canDelete: false,
    }));
  },

  async postComment(auth, id, text) {
    await postTaskComment(auth.userId, id, text);
  },
};
