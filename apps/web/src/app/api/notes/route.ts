import {
  canAttachNote,
  canWriteNotes,
  createNote,
  getObservationById,
} from "@placekeeping/core";
import { createNoteSchema } from "@placekeeping/shared-types";
import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/apiError";
import { getAuthContext } from "@/lib/session";

export const POST = withApiErrorHandling(async (request: NextRequest) => {
  const authContext = await getAuthContext();
  if (!authContext) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canWriteNotes(authContext)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createNoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Unsigned notes are an admin tool; everyone else is always signed.
  if (parsed.data.signed === false && !authContext.isSystemAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (parsed.data.observationId) {
    const observation = await getObservationById(parsed.data.observationId);
    if (!observation) {
      return NextResponse.json({ error: "Observation not found" }, { status: 404 });
    }
    if (!canAttachNote(authContext, observation)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const note = await createNote(parsed.data, authContext.userId);
  return NextResponse.json({ note }, { status: 201 });
});
