import {
  canEditNote,
  canPromoteNote,
  deleteNote,
  getNoteById,
  updateNote,
} from "@placekeeping/core";
import { updateNoteSchema } from "@placekeeping/shared-types";
import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/apiError";
import { getAuthContext } from "@/lib/session";

type Params = { params: Promise<{ noteId: string }> };

export const PATCH = withApiErrorHandling(
  async (request: NextRequest, { params }: Params) => {
    const { noteId } = await params;
    const authContext = await getAuthContext();
    if (!authContext) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const existing = await getNoteById(noteId);
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    const parsed = updateNoteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { promoted, ...edits } = parsed.data;
    // Promotion is a curation action, separate from editing -- an admin
    // promoting someone else's note must not need (or get) edit rights
    // beyond what canEditNote already grants admins.
    if (promoted !== undefined && !canPromoteNote(authContext)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (edits.signed === false && !authContext.isSystemAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (Object.keys(edits).length > 0 && !canEditNote(authContext, existing)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const note = await updateNote(
      noteId,
      { ...edits, promoted },
      authContext.userId,
    );
    return NextResponse.json({ note });
  },
);

export const DELETE = withApiErrorHandling(
  async (_request: NextRequest, { params }: Params) => {
    const { noteId } = await params;
    const authContext = await getAuthContext();
    if (!authContext) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const existing = await getNoteById(noteId);
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!canEditNote(authContext, existing)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await deleteNote(noteId, authContext.userId);
    return NextResponse.json({ ok: true });
  },
);
