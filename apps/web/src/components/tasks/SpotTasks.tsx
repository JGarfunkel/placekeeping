import {
  isTaskMember,
  listTasksForTarget,
  type AuthContext,
} from "@placekeeping/core";
import { TasksPanel } from "./TasksPanel";

// The spot page's Tasks panel. Tasks are never public: nothing renders for
// signed-out visitors or unverified accounts. Tasks are always native; when
// the spot is bound to Asana each one is mirrored there and shows a link.
export async function SpotTasks({
  spotId,
  authContext,
}: {
  spotId: number;
  authContext: AuthContext | null;
}) {
  if (!authContext || !isTaskMember(authContext)) return null;
  const { tasks } = await listTasksForTarget(authContext, { type: "spot", spotId });
  return (
    <TasksPanel spotId={spotId} currentUserId={authContext.userId} initialTasks={tasks} />
  );
}
