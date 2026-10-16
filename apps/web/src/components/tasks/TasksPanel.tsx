"use client";

import type { TaskSummary } from "@placekeeping/core";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CREATE_TASK_EVENT,
  type CreateTaskEventDetail,
} from "@/lib/taskEvents";
import { TaskRow } from "./TaskRow";

const FINISHED = ["done", "dropped"];

// Native tasks for a spot, for verified members and managers (the server
// decides who sees this at all). Open work first, finished work tucked below.
// An observation card can open the create form prefilled via CREATE_TASK_EVENT.
export function TasksPanel({
  spotId,
  currentUserId,
  initialTasks,
}: {
  spotId: number;
  currentUserId: string;
  initialTasks: TaskSummary[];
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueOn, setDueOn] = useState("");
  const [assignMe, setAssignMe] = useState(false);
  const [observationId, setObservationId] = useState<string | null>(null);
  const [showFinished, setShowFinished] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const rootRef = useRef<HTMLElement>(null);

  const reload = useCallback(async () => {
    const res = await fetch(`/api/tasks?spotId=${spotId}`);
    const body = await res.json().catch(() => null);
    if (res.ok && body?.tasks) setTasks(body.tasks);
  }, [spotId]);

  useEffect(() => {
    function onCreate(e: Event) {
      const d = (e as CustomEvent<CreateTaskEventDetail>).detail;
      setTitle(d.title);
      setDescription(d.description);
      setObservationId(d.observationId);
      setCreating(true);
      rootRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    window.addEventListener(CREATE_TASK_EVENT, onCreate);
    return () => window.removeEventListener(CREATE_TASK_EVENT, onCreate);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: { type: "spot", spotId },
          title,
          description,
          dueOn: dueOn || null,
          assigneeUserId: assignMe ? currentUserId : null,
          observationId,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          typeof body?.error === "string" ? body.error : "Please check the form and try again.",
        );
      }
      setTitle("");
      setDescription("");
      setDueOn("");
      setAssignMe(false);
      setObservationId(null);
      setCreating(false);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setPending(false);
    }
  }

  const open = tasks.filter((t) => !FINISHED.includes(t.status));
  const finished = tasks.filter((t) => FINISHED.includes(t.status));

  return (
    <section ref={rootRef} id="tasks" className="flex flex-col gap-3 rounded-md border border-neutral-200 p-4 text-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-medium">Tasks</h2>
        {!creating && (
          <button type="button" className="font-medium underline" onClick={() => setCreating(true)}>
            Add a task
          </button>
        )}
      </div>
      <p className="text-xs text-neutral-500">Only members and stewards can see these.</p>

      {creating && (
        <form onSubmit={submit} className="flex flex-col gap-2 rounded-md bg-neutral-50 p-3">
          <input required maxLength={200} placeholder="What needs doing?"
            className="rounded-md border border-neutral-300 px-3 py-2"
            value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea rows={3} maxLength={10000} placeholder="Details (optional)"
            className="rounded-md border border-neutral-300 px-3 py-2"
            value={description} onChange={(e) => setDescription(e.target.value)} />
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2">
              Due
              <input type="date" className="rounded-md border border-neutral-300 px-2 py-1"
                value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={assignMe} onChange={(e) => setAssignMe(e.target.checked)} />
              Assign to me
            </label>
          </div>
          {observationId && (
            <p className="text-xs text-neutral-500">Linked to the observation you started from.</p>
          )}
          {error && <p className="text-red-600">{error}</p>}
          <div className="flex gap-3">
            <button type="submit" disabled={pending}
              className="rounded-md bg-neutral-900 px-4 py-2 font-medium text-white disabled:opacity-50">
              {pending ? "Adding…" : "Add task"}
            </button>
            <button type="button" className="underline" onClick={() => setCreating(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {open.length === 0 && !creating && <p className="text-neutral-600">No open tasks.</p>}
      <ul className="flex flex-col gap-2">
        {open.map((t) => (
          <TaskRow key={t.id} task={t} currentUserId={currentUserId} onChanged={reload} />
        ))}
      </ul>

      {finished.length > 0 && (
        <div className="flex flex-col gap-2">
          <button type="button" className="self-start text-xs underline"
            onClick={() => setShowFinished((v) => !v)}>
            {showFinished ? "Hide" : "Show"} done and dropped ({finished.length})
          </button>
          {showFinished && (
            <ul className="flex flex-col gap-2">
              {finished.map((t) => (
                <TaskRow key={t.id} task={t} currentUserId={currentUserId} onChanged={reload} />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
