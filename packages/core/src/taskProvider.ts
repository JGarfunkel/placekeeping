import type { AuthContext } from "./auth";
import { asanaTaskProvider } from "./asanaTaskProvider";
import { IntegrationError } from "./integrations";
import { nativeTaskProvider } from "./nativeTaskProvider";
import type { TaskProvider, TaskProviderKind, TaskTarget } from "./taskTypes";

// Native is the source of truth for tasks. A place bound to an Asana project
// has each native task mirrored there by taskSync.ts; new tasks are always
// created natively. The Asana provider remains only to read and edit
// "legacy" tasks that were created in Asana before mirroring existed (they
// have external_links rows but no native task). The interface and shared
// types are in taskTypes.ts.

export function getTaskProvider(kind: TaskProviderKind): TaskProvider {
  if (kind === "asana") return asanaTaskProvider;
  if (kind === "native") return nativeTaskProvider;
  throw new IntegrationError(400, "Unknown task provider.");
}

/** Tasks for the Tasks panel: always the native tasks on a target. */
export async function listTasksForTarget(auth: AuthContext, target: TaskTarget) {
  return {
    provider: "native" as const,
    capabilities: nativeTaskProvider.capabilities,
    tasks: await nativeTaskProvider.listTasks(auth, target),
  };
}
