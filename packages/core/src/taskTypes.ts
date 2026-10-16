import type { AuthContext } from "./auth";
import { IntegrationError } from "./integrations";

// Shared task types and helpers. Kept apart from taskProvider.ts (which picks
// a provider and so imports every implementation) so implementations can
// import these without an import cycle.

export type TaskStatus = "open" | "in_progress" | "done" | "dropped";
export type TaskProviderKind = "native" | "asana";

// State of a native task's copy in the bound Asana project (null = none).
export type TaskSyncStatus = "synced" | "pending" | "failed";

export interface TaskProviderCapabilities {
  // Statuses the provider can actually represent (Asana: open and done).
  statuses: readonly TaskStatus[];
  // Whether Placekeeping can set the assignee (by Placekeeping user).
  assignees: boolean;
  comments: boolean;
  dueDates: boolean;
  // Whether a task can be deleted through Placekeeping (vs. dropped).
  delete: boolean;
}

// What a task belongs to: never free-floating. Providers support the targets
// they can (Asana: spot and observation).
export type TaskTarget =
  | { type: "site"; siteId: number }
  | { type: "spot"; spotId: number }
  | { type: "observation"; observationId: string }
  | { type: "event"; eventId: string };

// Provider-neutral row for the Tasks panel. `id` is opaque to callers:
// the external_link id for Asana, the task id for native.
export interface TaskSummary {
  id: string;
  provider: TaskProviderKind;
  title: string;
  status: TaskStatus;
  dueOn: string | null;
  assigneeUserId: string | null;
  assigneeName: string | null;
  // Link out to the provider's own page; for a native task, its Asana copy.
  url: string | null;
  syncStatus: TaskSyncStatus | null;
}

export interface TaskDetail extends TaskSummary {
  description: string;
  createdBy: string | null;
  createdAt: string | null;
  completedAt: string | null;
  // Whether the viewer may edit / delete this task (the UI never offers
  // what the server would reject).
  canEdit: boolean;
  canDelete: boolean;
}

export interface TaskComment {
  id: string;
  userId: string | null;
  author: string;
  text: string;
  createdAt: string;
  editedAt: string | null;
  canEdit: boolean;
  canDelete: boolean;
}

export interface CreateTaskInput {
  target: TaskTarget;
  title: string;
  description: string;
  dueOn: string | null;
  // Placekeeping user to assign (native only).
  assigneeUserId: string | null;
  // The observation that prompted the task, when created from one.
  observationId: string | null;
  photoUrl: string | null;
}

export interface UpdateTaskPatch {
  title?: string;
  description?: string;
  status?: TaskStatus;
  // null clears the due date / assignee.
  dueOn?: string | null;
  assigneeUserId?: string | null;
}

// Every method takes the caller's AuthContext: native providers enforce
// permissions with it, and Asana acts as the caller's linked identity (so
// Asana's own permissions apply).
export interface TaskProvider {
  kind: TaskProviderKind;
  capabilities: TaskProviderCapabilities;
  listTasks(auth: AuthContext, target: TaskTarget): Promise<TaskSummary[]>;
  getTask(auth: AuthContext, id: string): Promise<TaskDetail>;
  createTask(auth: AuthContext, input: CreateTaskInput): Promise<TaskSummary>;
  updateTask(auth: AuthContext, id: string, patch: UpdateTaskPatch): Promise<TaskDetail>;
  deleteTask?(auth: AuthContext, id: string): Promise<void>;
  listComments(auth: AuthContext, id: string): Promise<TaskComment[]>;
  postComment(auth: AuthContext, id: string, text: string): Promise<void>;
  editComment?(auth: AuthContext, commentId: string, text: string): Promise<void>;
  deleteComment?(auth: AuthContext, commentId: string): Promise<void>;
}

/** Rejects a status the provider can't represent, before it is sent. */
export function assertStatusSupported(
  provider: Pick<TaskProvider, "kind" | "capabilities">,
  status: TaskStatus,
) {
  if (!provider.capabilities.statuses.includes(status)) {
    throw new IntegrationError(
      400,
      `${provider.kind === "asana" ? "Asana" : "This task list"} doesn't support the "${status}" status.`,
    );
  }
}
