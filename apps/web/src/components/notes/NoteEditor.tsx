"use client";

import {
  NOTE_BODY_MAX_LENGTH,
  NOTE_TITLE_MAX_LENGTH,
} from "@placekeeping/shared-types";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { NoteHtml } from "./NoteHtml";

type Tab = "write" | "preview";

// Create (no `note`) or edit (with `note`) a note. Markdown in a plain
// textarea with a server-rendered preview -- the preview goes through the
// same sanitizer as saved notes, so it shows exactly what readers will see.
export function NoteEditor({
  note,
  observationId,
  canSetSigned = false,
  onDone,
}: {
  note?: {
    noteId: string;
    title: string | null;
    body: string;
    signed: boolean;
  };
  // Admin-only: offer the "sign with my username" checkbox. Everyone else is
  // always signed, and the API rejects unsigned notes from non-admins.
  canSetSigned?: boolean;
  // Attach a new note to this observation. Ignored when editing.
  observationId?: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(note?.title ?? "");
  const [body, setBody] = useState(note?.body ?? "");
  const [signed, setSigned] = useState(note?.signed ?? true);
  const [tab, setTab] = useState<Tab>("write");
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function showPreview() {
    setTab("preview");
    setPreviewHtml(null);
    setError(null);
    const response = await fetch("/api/notes/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    if (!response.ok) {
      setError("Couldn't render the preview.");
      return;
    }
    setPreviewHtml((await response.json()).html);
  }

  async function save() {
    setSaving(true);
    setError(null);
    const response = await fetch(
      note ? `/api/notes/${note.noteId}` : "/api/notes",
      {
        method: note ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || null,
          body,
          ...(canSetSigned ? { signed } : {}),
          ...(note ? {} : { observationId: observationId ?? null }),
        }),
      },
    );
    setSaving(false);
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setError(
        typeof data?.error === "string" ? data.error : "Couldn't save the note.",
      );
      return;
    }
    router.refresh();
    onDone();
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-neutral-300 p-3">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={NOTE_TITLE_MAX_LENGTH}
        placeholder="Title (optional)"
        className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
      />

      <div className="flex gap-3 text-sm">
        <button
          type="button"
          onClick={() => setTab("write")}
          className={tab === "write" ? "font-medium underline" : "text-neutral-500"}
        >
          Write
        </button>
        <button
          type="button"
          onClick={showPreview}
          disabled={!body.trim()}
          className={`${tab === "preview" ? "font-medium underline" : "text-neutral-500"} disabled:opacity-50`}
        >
          Preview
        </button>
        <span className="ml-auto text-xs text-neutral-400">
          Markdown or simple HTML
        </span>
      </div>

      {tab === "write" ? (
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={NOTE_BODY_MAX_LENGTH}
          rows={10}
          placeholder="Write your note…"
          className="rounded-md border border-neutral-300 px-2 py-1 font-mono text-sm"
        />
      ) : previewHtml === null ? (
        <p className="py-4 text-sm text-neutral-500">Rendering…</p>
      ) : (
        <NoteHtml html={previewHtml} />
      )}

      {canSetSigned && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={signed}
            onChange={(e) => setSigned(e.target.checked)}
          />
          Sign with my username
        </label>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving || !body.trim()}
          className="rounded-md bg-neutral-900 px-3 py-1 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : note ? "Save" : "Post note"}
        </button>
        <button
          type="button"
          onClick={onDone}
          disabled={saving}
          className="rounded-md border border-neutral-300 px-3 py-1 text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
