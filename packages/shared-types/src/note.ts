import { z } from "zod";

// Markdown source; rendered and sanitized by the web app. The cap keeps a
// note in the "write-up" range rather than a document store.
export const NOTE_BODY_MAX_LENGTH = 20000;
export const NOTE_TITLE_MAX_LENGTH = 200;

const noteTitleSchema = z.string().trim().max(NOTE_TITLE_MAX_LENGTH);
const noteBodySchema = z.string().trim().min(1).max(NOTE_BODY_MAX_LENGTH);

export const createNoteSchema = z.object({
  title: noteTitleSchema.nullish().transform((v) => v || null),
  body: noteBodySchema,
  // false = unsigned; admin-only, the routes enforce that.
  signed: z.boolean().optional(),
  // Attaching to an observation also surfaces the note on its spot and site.
  observationId: z.string().uuid().nullish().transform((v) => v ?? null),
});
export type CreateNoteInput = z.infer<typeof createNoteSchema>;

// observationId is deliberately not editable: re-pointing a note would
// silently move it between spots.
export const updateNoteSchema = z
  .object({
    title: noteTitleSchema.nullish().transform((v) => v || null),
    body: noteBodySchema,
    signed: z.boolean(),
    // Admin-only; the route rejects it from anyone else.
    promoted: z.boolean(),
  })
  .partial();
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;

export type Note = {
  noteId: string;
  authorId: string | null;
  authorUsername: string | null;
  title: string | null;
  body: string;
  signed: boolean;
  observationId: string | null;
  // Set only for notes attached to an observation.
  spotId: number | null;
  spotName: string | null;
  promotedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

// The username to sign the note with, or null when it is unsigned (or its
// author's account is gone).
export function noteSignedBy(note: {
  signed: boolean;
  authorUsername: string | null;
}): string | null {
  return note.signed ? note.authorUsername : null;
}
