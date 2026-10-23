"use client";

import { useState } from "react";
import type { RenderedNote } from "@/lib/renderNotes";
import { NoteCard } from "./NoteCard";
import { NoteEditor } from "./NoteEditor";

// A heading, optional composer, and a list of notes. Used on the personal
// page (standalone composer) and under each observation (composer bound to it).
export function NotesSection({
  notes,
  currentUserId,
  isSystemAdmin,
  canWrite,
  canCompose = canWrite,
  observationId,
  heading,
  showSpot,
  showAuthor,
  addLabel = "+ Write a note",
}: {
  notes: RenderedNote[];
  currentUserId: string | null;
  isSystemAdmin: boolean;
  // Edit/delete rights over the caller's own notes.
  canWrite: boolean;
  // Whether to offer the composer; differs from canWrite for observations the
  // caller may not attach notes to (see canAttachNote).
  canCompose?: boolean;
  observationId?: string;
  heading?: string;
  showSpot?: boolean;
  showAuthor?: boolean;
  addLabel?: string;
}) {
  const [composing, setComposing] = useState(false);
  if (notes.length === 0 && !canCompose) return null;

  return (
    <section className="flex flex-col gap-3">
      {heading && <h2 className="text-lg font-medium">{heading}</h2>}
      {canCompose &&
        (composing ? (
          <NoteEditor
            observationId={observationId}
            canSetSigned={isSystemAdmin}
            onDone={() => setComposing(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setComposing(true)}
            className="self-start text-sm font-medium text-neutral-600 underline hover:text-neutral-900"
          >
            {addLabel}
          </button>
        ))}
      {notes.map((note) => (
        <NoteCard
          key={note.noteId}
          note={note}
          canEdit={
            isSystemAdmin || (canWrite && currentUserId === note.authorId)
          }
          canPromote={isSystemAdmin}
          canSetSigned={isSystemAdmin}
          showSpot={showSpot}
          showAuthor={showAuthor}
        />
      ))}
    </section>
  );
}
