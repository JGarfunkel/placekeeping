import "server-only";

import type { Note } from "@placekeeping/shared-types";
import { renderNoteHtml } from "./renderNoteHtml";

// A note plus its sanitized HTML, so client components can display it
// without bundling the markdown/sanitizer libraries.
export type RenderedNote = Note & { html: string };

export function renderNotes(notes: Note[]): RenderedNote[] {
  return notes.map((note) => ({ ...note, html: renderNoteHtml(note.body) }));
}
