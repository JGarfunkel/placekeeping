import { getNoteById } from "@placekeeping/core";
import { noteSignedBy } from "@placekeeping/shared-types";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { NoteHtml } from "@/components/notes/NoteHtml";
import { renderNotes } from "@/lib/renderNotes";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const loadNote = cache(async (noteId: string) => {
  if (!UUID_RE.test(noteId)) return null;
  const note = await getNoteById(noteId);
  return note ? renderNotes([note])[0] : null;
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ noteId: string }>;
}): Promise<Metadata> {
  const { noteId } = await params;
  const note = await loadNote(noteId);
  return note?.title ? { title: `${note.title} — Placekeeping` } : {};
}

export default async function NotePage({
  params,
}: {
  params: Promise<{ noteId: string }>;
}) {
  const { noteId } = await params;
  const note = await loadNote(noteId);
  if (!note) notFound();

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-8">
      <article>
        {note.title && (
          <h1 className="mb-2 text-2xl font-semibold">{note.title}</h1>
        )}
        <NoteHtml html={note.html} />
        {noteSignedBy(note) && (
          <p className="mt-1 text-sm text-neutral-500">
            <Link href={`/user/${note.authorUsername}`} className="underline">
              @{note.authorUsername}
            </Link>
          </p>
        )}
      </article>
    </main>
  );
}
