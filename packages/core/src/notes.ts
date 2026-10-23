import { db, notes, observations, spots, users } from "@placekeeping/db";
import type {
  CreateNoteInput,
  Note,
  UpdateNoteInput,
} from "@placekeeping/shared-types";
import { desc, eq, inArray, isNotNull } from "drizzle-orm";
import { diffFields, logEvent, snapshotToChanges } from "./events";

export class NoteError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "NoteError";
  }
}

// Author and (for observation-attached notes) spot are left-joined: the
// author FK is set-null on user delete, and a standalone note has no
// observation at all.
const noteSelect = {
  noteId: notes.noteId,
  authorId: notes.authorId,
  authorUsername: users.username,
  title: notes.title,
  body: notes.body,
  signed: notes.signed,
  observationId: notes.observationId,
  spotId: observations.spotId,
  spotName: spots.name,
  promotedAt: notes.promotedAt,
  createdAt: notes.createdAt,
  updatedAt: notes.updatedAt,
};

function selectNotes() {
  return db
    .select(noteSelect)
    .from(notes)
    .leftJoin(users, eq(notes.authorId, users.userId))
    .leftJoin(observations, eq(notes.observationId, observations.observationId))
    .leftJoin(spots, eq(observations.spotId, spots.spotId));
}

function toNoteDto(row: Awaited<ReturnType<typeof selectNotes>>[number]): Note {
  return {
    ...row,
    promotedAt: row.promotedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getNoteById(noteId: string): Promise<Note | null> {
  const [row] = await selectNotes().where(eq(notes.noteId, noteId)).limit(1);
  return row ? toNoteDto(row) : null;
}

// The caller is expected to have checked canWriteNotes.
export async function createNote(
  input: CreateNoteInput,
  userId: string,
): Promise<Note> {
  if (input.observationId) {
    const [observation] = await db
      .select({ observationId: observations.observationId })
      .from(observations)
      .where(eq(observations.observationId, input.observationId))
      .limit(1);
    if (!observation) throw new NoteError(404, "Observation not found");
  }

  const [row] = await db
    .insert(notes)
    .values({
      authorId: userId,
      observationId: input.observationId,
      title: input.title,
      body: input.body,
      signed: input.signed ?? true,
    })
    .returning();

  await logEvent({
    entityType: "note",
    entityId: row.noteId,
    action: "create",
    userId,
    changes: snapshotToChanges(
      {
        title: row.title,
        body: row.body,
        signed: row.signed,
        observationId: row.observationId,
      },
      "create",
    ),
  });

  return (await getNoteById(row.noteId))!;
}

// Undefined fields mean "leave unchanged". The caller has already checked
// canEditNote, and canPromoteNote if `promoted` is present.
export async function updateNote(
  noteId: string,
  input: UpdateNoteInput,
  userId: string,
): Promise<Note> {
  const existing = await getNoteById(noteId);
  if (!existing) throw new NoteError(404, "Note not found");

  const promotedChanged =
    input.promoted !== undefined &&
    input.promoted !== (existing.promotedAt !== null);

  await db
    .update(notes)
    .set({
      title: input.title === undefined ? existing.title : input.title,
      body: input.body ?? existing.body,
      signed: input.signed ?? existing.signed,
      ...(promotedChanged
        ? {
            promotedAt: input.promoted ? new Date() : null,
            promotedByUserId: input.promoted ? userId : null,
          }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(notes.noteId, noteId));

  const updated = (await getNoteById(noteId))!;
  const changes = diffFields(
    {
      title: existing.title,
      body: existing.body,
      signed: existing.signed,
      promoted: existing.promotedAt !== null,
    },
    {
      title: updated.title,
      body: updated.body,
      signed: updated.signed,
      promoted: updated.promotedAt !== null,
    },
    input as Record<string, unknown>,
  );
  if (changes) {
    await logEvent({
      entityType: "note",
      entityId: noteId,
      action: "update",
      userId,
      changes,
    });
  }
  return updated;
}

export async function deleteNote(
  noteId: string,
  userId: string,
): Promise<boolean> {
  const existing = await getNoteById(noteId);
  if (!existing) return false;
  await db.delete(notes).where(eq(notes.noteId, noteId));
  await logEvent({
    entityType: "note",
    entityId: noteId,
    action: "delete",
    userId,
    changes: snapshotToChanges(
      {
        title: existing.title,
        body: existing.body,
        observationId: existing.observationId,
      },
      "delete",
    ),
  });
  return true;
}

// Everything a user has written, attached or not -- backs their personal page.
export async function listNotesByAuthor(
  authorId: string,
  limit = 100,
): Promise<Note[]> {
  const rows = await selectNotes()
    .where(eq(notes.authorId, authorId))
    .orderBy(desc(notes.createdAt))
    .limit(limit);
  return rows.map(toNoteDto);
}

// Grouped by observationId; observations with no notes are absent.
export async function listNotesForObservations(
  observationIds: string[],
): Promise<Record<string, Note[]>> {
  if (observationIds.length === 0) return {};
  const rows = await selectNotes()
    .where(inArray(notes.observationId, observationIds))
    .orderBy(notes.createdAt);
  const byObservation: Record<string, Note[]> = {};
  for (const row of rows) {
    (byObservation[row.observationId!] ??= []).push(toNoteDto(row));
  }
  return byObservation;
}

// Notes attached to any observation on any spot in the site.
export async function listNotesForSite(
  siteId: number,
  limit = 50,
): Promise<Note[]> {
  const rows = await selectNotes()
    .where(eq(spots.siteId, siteId))
    .orderBy(desc(notes.createdAt))
    .limit(limit);
  return rows.map(toNoteDto);
}

// Front-page feed, most recently promoted first.
export async function listPromotedNotes(limit = 10): Promise<Note[]> {
  const rows = await selectNotes()
    .where(isNotNull(notes.promotedAt))
    .orderBy(desc(notes.promotedAt))
    .limit(limit);
  return rows.map(toNoteDto);
}
