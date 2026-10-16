// Window event that lets another panel (e.g. an observation card) open the
// Tasks panel's create form with fields prefilled, without the two sharing
// React state. See TasksPanel.
export const CREATE_TASK_EVENT = "placekeeping:create-task";

export type CreateTaskEventDetail = {
  title: string;
  description: string;
  observationId: string | null;
};

export function requestCreateTask(detail: CreateTaskEventDetail) {
  window.dispatchEvent(new CustomEvent(CREATE_TASK_EVENT, { detail }));
}
