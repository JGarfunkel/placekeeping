"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Option = { gid: string; name: string };

type Scope = { stewardId: string } | { siteId: number } | { spotId: number };

export function AsanaBindingEditor({
  scope,
  identities,
  binding,
  title = "Asana project",
  note = null,
}: {
  scope: Scope;
  identities: { id: string; remoteWorkspaceName: string | null }[];
  // This scope's own binding (not one inherited from a wider scope).
  binding: { remoteProjectName: string | null } | null;
  title?: string;
  // Extra context, e.g. which wider binding applies while this scope has none.
  note?: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [identityId, setIdentityId] = useState(identities[0]?.id ?? "");
  const [projects, setProjects] = useState<Option[]>([]);
  const [sections, setSections] = useState<Option[]>([]);
  const [projectId, setProjectId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [syncNote, setSyncNote] = useState<string | null>(null);

  useEffect(() => {
    if (!editing || !identityId) return;
    let cancelled = false;
    setProjects([]);
    setProjectId("");
    fetch(`/api/integrations/asana/projects?identityId=${identityId}`)
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error ?? "Failed to load projects");
        if (!cancelled) setProjects(body.projects);
      })
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [editing, identityId]);

  useEffect(() => {
    setSections([]);
    setSectionId("");
    if (!projectId) return;
    let cancelled = false;
    fetch(
      `/api/integrations/asana/sections?identityId=${identityId}&projectId=${projectId}`,
    )
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (res.ok && !cancelled) setSections(body.sections);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [identityId, projectId]);

  async function send(method: "PUT" | "DELETE", payload: object) {
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/integrations/asana/bindings", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          typeof body?.error === "string" ? body.error : "Request failed",
        );
      }
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setPending(false);
    }
  }

  // Copies the tasks that already exist here to the bound project; new tasks
  // sync on their own.
  async function syncExisting() {
    setError(null);
    setSyncNote(null);
    setPending(true);
    try {
      const res = await fetch("/api/integrations/asana/sync-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(typeof body?.error === "string" ? body.error : "Request failed");
      }
      setSyncNote(
        body.queued === 0
          ? "Every task here is already copied."
          : `Copying ${body.queued} task${body.queued === 1 ? "" : "s"} to Asana.`,
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-neutral-200 p-4 text-sm">
      <h2 className="text-base font-medium">{title}</h2>
      {binding ? (
        <p>
          Bound to <strong>{binding.remoteProjectName ?? "an Asana project"}</strong>.
        </p>
      ) : (
        <p className="text-neutral-600">Not bound to an Asana project.</p>
      )}
      {note && <p className="text-xs text-neutral-500">{note}</p>}

      {!editing && (
        <div className="flex gap-3">
          <button type="button" className="underline" onClick={() => setEditing(true)}>
            {binding ? "Change" : "Bind a project"}
          </button>
          {binding && (
            <button
              type="button"
              className="underline"
              disabled={pending}
              onClick={() => send("DELETE", { scope })}
            >
              Remove
            </button>
          )}
          {binding && (
            <button type="button" className="underline" disabled={pending} onClick={syncExisting}>
              Copy existing tasks to Asana
            </button>
          )}
        </div>
      )}
      {syncNote && <p className="text-xs text-neutral-600">{syncNote}</p>}

      {editing && (
        <div className="flex flex-col gap-2">
          {identities.length > 1 && (
            <label className="flex flex-col gap-1">
              Workspace
              <select
                className="rounded-md border border-neutral-300 px-3 py-2"
                value={identityId}
                onChange={(e) => setIdentityId(e.target.value)}
              >
                {identities.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.remoteWorkspaceName ?? i.id}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex flex-col gap-1">
            Project
            <select
              className="rounded-md border border-neutral-300 px-3 py-2"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">Choose a project…</option>
              {projects.map((p) => (
                <option key={p.gid} value={p.gid}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          {sections.length > 0 && (
            <label className="flex flex-col gap-1">
              Default section
              <select
                className="rounded-md border border-neutral-300 px-3 py-2"
                value={sectionId}
                onChange={(e) => setSectionId(e.target.value)}
              >
                <option value="">None</option>
                {sections.map((s) => (
                  <option key={s.gid} value={s.gid}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              disabled={!projectId || pending}
              onClick={() =>
                send("PUT", {
                  scope,
                  identityId,
                  remoteProjectId: projectId,
                  remoteSectionId: sectionId || null,
                })
              }
              className="rounded-md bg-neutral-900 px-4 py-2 font-medium text-white disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save binding"}
            </button>
            <button type="button" className="underline" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && <p className="text-red-600">{error}</p>}
    </div>
  );
}
