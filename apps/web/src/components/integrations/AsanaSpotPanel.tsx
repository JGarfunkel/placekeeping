"use client";

import { useState } from "react";

type Link = {
  id: string;
  remoteUrl: string;
  cachedTitle: string | null;
  cachedStatus: string | null;
};

type Comment = { gid: string; author: string; text: string; createdAt: string };

// Tasks are created in the Tasks panel (native, then mirrored to Asana). This
// panel lists the Asana tasks that have no native counterpart: recurring
// tasks, and tasks created in Asana before mirroring existed.
export function AsanaSpotPanel({
  projectName,
  links,
  suggested,
}: {
  projectName: string | null;
  links: Link[];
  suggested: boolean;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-md border border-neutral-200 p-4 text-sm">
      <h2 className="text-base font-medium">
        Asana{projectName ? `: ${projectName}` : ""}
      </h2>
      <p className="text-xs text-neutral-500">
        Tasks you add in the Tasks panel are copied to this project
        automatically. Listed here: recurring tasks and tasks made directly in
        Asana.
      </p>

      {suggested && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-amber-900">
          The latest observation shows heavy overgrowth. Consider adding a task
          in the Tasks panel.
        </p>
      )}

      {links.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {links.map((link) => (
            <TaskItem key={link.id} link={link} />
          ))}
        </ul>
      ) : (
        <p className="text-neutral-600">No other linked tasks.</p>
      )}
    </section>
  );
}

function TaskItem({ link }: { link: Link }) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const endpoint = `/api/integrations/asana/links/${link.id}/comments`;

  async function load() {
    setError(null);
    try {
      const res = await fetch(endpoint);
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Failed to load comments");
      setComments(body.comments);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && comments === null) await load();
  }

  async function post(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: reply }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Failed to post comment");
      setReply("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setPending(false);
    }
  }

  const done = link.cachedStatus === "done";
  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span
          className={
            "rounded-full px-2 py-0.5 text-xs " +
            (done ? "bg-green-100 text-green-800" : "bg-neutral-100")
          }
        >
          {done ? "Done" : "Open"}
        </span>
        <a
          href={link.remoteUrl}
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          {link.cachedTitle ?? "Asana task"}
        </a>
        <button type="button" className="ml-auto text-xs underline" onClick={toggle}>
          {open ? "Hide discussion" : "Discussion"}
        </button>
      </div>
      {open && (
        <div className="ml-2 flex flex-col gap-2 border-l border-neutral-200 pl-3">
          {comments === null && !error && (
            <p className="text-neutral-500">Loading…</p>
          )}
          {comments?.length === 0 && (
            <p className="text-neutral-500">No comments yet.</p>
          )}
          {comments?.map((c) => (
            <div key={c.gid}>
              <p className="text-xs text-neutral-500">
                {c.author} · {new Date(c.createdAt).toLocaleString()}
              </p>
              <p className="whitespace-pre-wrap">{c.text}</p>
            </div>
          ))}
          <form onSubmit={post} className="flex flex-col gap-2">
            <textarea
              required
              rows={2}
              placeholder="Reply as you in Asana…"
              className="rounded-md border border-neutral-300 px-3 py-2"
              value={reply}
              onChange={(e) => setReply(e.target.value)}
            />
            <div>
              <button
                type="submit"
                disabled={pending || !reply.trim()}
                className="rounded-md bg-neutral-900 px-3 py-1.5 font-medium text-white disabled:opacity-50"
              >
                {pending ? "Posting…" : "Post comment"}
              </button>
            </div>
          </form>
          {error && <p className="text-red-600">{error}</p>}
        </div>
      )}
    </li>
  );
}
