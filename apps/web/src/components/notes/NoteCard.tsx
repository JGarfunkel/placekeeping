"use client";

import { noteSignedBy } from "@placekeeping/shared-types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { RenderedNote } from "@/lib/renderNotes";
import { NoteEditor } from "./NoteEditor";
import { NoteHtml } from "./NoteHtml";

export function NoteCard({
  note,
  canEdit,
  canPromote,
  canSetSigned = false,
  // Hide the spot link where the surrounding page already is that spot.
  showSpot = true,
  // Hide the author where the surrounding page is that author's own.
  showAuthor = true,
}: {
  note: RenderedNote;
  canEdit: boolean;
  canPromote: boolean;
  canSetSigned?: boolean;
  showSpot?: boolean;
  showAuthor?: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function request(method: "PATCH" | "DELETE", body?: unknown) {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/notes/${note.noteId}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    setBusy(false);
    if (!response.ok) {
      setError("That didn't work. Please try again.");
      return;
    }
    router.refresh();
  }

  if (editing) {
    return (
      <NoteEditor
        note={note}
        canSetSigned={canSetSigned}
        onDone={() => setEditing(false)}
      />
    );
  }

  const promoted = note.promotedAt !== null;
  const signedBy = showAuthor ? noteSignedBy(note) : null;
  return (
    <article className="rounded-md border border-neutral-200 p-4">
      {note.title && <h3 className="mb-1 text-base font-semibold">{note.title}</h3>}
      <NoteHtml html={note.html} />

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
        {signedBy && (
          <Link href={`/user/${signedBy}`} className="underline">
            @{signedBy}
          </Link>
        )}
        <span>{new Date(note.createdAt).toLocaleDateString()}</span>
        {showSpot && note.spotId !== null && (
          <Link href={`/spots/${note.spotId}`} className="underline">
            {note.spotName}
          </Link>
        )}
        {promoted && (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">
            On front page
          </span>
        )}

        <span className="ml-auto flex gap-3">
          {canPromote && (
            <button
              type="button"
              disabled={busy}
              onClick={() => request("PATCH", { promoted: !promoted })}
              className="underline disabled:opacity-50"
            >
              {promoted ? "Remove from front page" : "Promote to front page"}
            </button>
          )}
          {canEdit && (
            <>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="underline"
              >
                Edit
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (confirm("Delete this note?")) void request("DELETE");
                }}
                className="text-red-700 underline disabled:opacity-50"
              >
                Delete
              </button>
            </>
          )}
        </span>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </article>
  );
}
