"use client";

import type { TaskComment, TaskDetail, TaskStatus, TaskSummary } from "@placekeeping/core";
import { useState } from "react";

export const statusLabels: Record<TaskStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  done: "Done",
  dropped: "Dropped",
};

const STATUSES: TaskStatus[] = ["open", "in_progress", "done", "dropped"];

async function api(url: string, method: string, payload?: object) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(
      typeof body?.error === "string" ? body.error : "Something went wrong",
    );
  }
  return body;
}

// One task: a summary line that expands to details, edit controls (only
// what the server says this viewer may do) and the comment thread.
export function TaskRow({
  task,
  currentUserId,
  onChanged,
}: {
  task: TaskSummary;
  currentUserId: string;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const base = `/api/tasks/${task.provider}/${task.id}`;

  async function load() {
    const [d, c] = await Promise.all([api(base, "GET"), api(`${base}/comments`, "GET")]);
    setDetail(d.task);
    setComments(c.comments);
  }

  async function run(fn: () => Promise<void>) {
    setError(null);
    setPending(true);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setPending(false);
    }
  }

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !detail) await run(load);
  }

  const patch = (body: object) =>
    run(async () => {
      const res = await api(base, "PATCH", body);
      setDetail(res.task);
      onChanged();
    });

  const finished = task.status === "done" || task.status === "dropped";

  return (
    <li className="rounded-md border border-neutral-200 p-3 text-sm">
      <button type="button" onClick={toggle} className="flex w-full items-start justify-between gap-3 text-left">
        <span className={finished ? "text-neutral-500 line-through" : "font-medium"}>
          {task.title}
        </span>
        <span className="shrink-0 text-xs text-neutral-500">
          {statusLabels[task.status]}
          {task.dueOn ? ` · due ${task.dueOn}` : ""}
          {task.assigneeName ? ` · @${task.assigneeName}` : ""}
        </span>
      </button>

      {open && (
        <div className="mt-3 flex flex-col gap-3 border-t border-neutral-100 pt-3">
          {!detail && !error && <p className="text-neutral-500">Loading…</p>}
          {detail && (
            <>
              {detail.description && (
                <p className="whitespace-pre-line text-neutral-700">{detail.description}</p>
              )}
              {detail.canEdit && (
                <div className="flex flex-wrap items-end gap-3">
                  <label className="flex flex-col gap-1 text-xs">
                    Status
                    <select
                      disabled={pending}
                      className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
                      value={detail.status}
                      onChange={(e) => patch({ status: e.target.value })}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>{statusLabels[s]}</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    Due
                    <input
                      type="date"
                      disabled={pending}
                      className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
                      value={detail.dueOn ?? ""}
                      onChange={(e) => patch({ dueOn: e.target.value || null })}
                    />
                  </label>
                  {detail.assigneeUserId === null && (
                    <button type="button" disabled={pending} className="underline"
                      onClick={() => patch({ assigneeUserId: currentUserId })}>
                      Assign to me
                    </button>
                  )}
                  {detail.assigneeUserId === currentUserId && (
                    <button type="button" disabled={pending} className="underline"
                      onClick={() => patch({ assigneeUserId: null })}>
                      Unassign me
                    </button>
                  )}
                </div>
              )}
              {detail.canDelete && (
                <div>
                  <button type="button" disabled={pending} className="text-red-700 underline"
                    onClick={() => {
                      if (!window.confirm("Delete this task? You can drop it instead to keep it in history.")) return;
                      void run(async () => {
                        await api(base, "DELETE");
                        onChanged();
                      });
                    }}>
                    Delete task
                  </button>
                </div>
              )}

              <div className="flex flex-col gap-2">
                <h3 className="text-xs font-medium uppercase text-neutral-500">Comments</h3>
                {comments.length === 0 && <p className="text-neutral-500">No comments yet.</p>}
                {comments.map((c) => (
                  <div key={c.id} className="rounded bg-neutral-50 p-2">
                    <div className="flex justify-between text-xs text-neutral-500">
                      <span>
                        @{c.author} · {new Date(c.createdAt).toLocaleString()}
                        {c.editedAt ? " (edited)" : ""}
                      </span>
                      {c.canDelete && task.provider === "native" && (
                        <button type="button" className="underline"
                          onClick={() => run(async () => {
                            await api(`${base}/comments/${c.id}`, "DELETE");
                            await load();
                          })}>
                          Delete
                        </button>
                      )}
                    </div>
                    <p className="whitespace-pre-line">{c.text}</p>
                  </div>
                ))}
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(async () => {
                      await api(`${base}/comments`, "POST", { text });
                      setText("");
                      await load();
                    });
                  }}
                >
                  <input required maxLength={5000} placeholder="Add a comment"
                    className="flex-1 rounded-md border border-neutral-300 px-3 py-1.5"
                    value={text} onChange={(e) => setText(e.target.value)} />
                  <button type="submit" disabled={pending}
                    className="rounded-md bg-neutral-900 px-3 py-1.5 font-medium text-white disabled:opacity-50">
                    Post
                  </button>
                </form>
              </div>
            </>
          )}
          {error && <p className="text-red-600">{error}</p>}
        </div>
      )}
    </li>
  );
}
