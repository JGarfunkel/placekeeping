import { canWriteNotes } from "@placekeeping/core";
import { NOTE_BODY_MAX_LENGTH } from "@placekeeping/shared-types";
import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/apiError";
import { renderNoteHtml } from "@/lib/renderNoteHtml";
import { getAuthContext } from "@/lib/session";

// Renders the editor's preview tab through the same sanitizer the saved note
// will go through, so what the author previews is what readers get. POST, but
// writes nothing.
export const POST = withApiErrorHandling(async (request: NextRequest) => {
  const authContext = await getAuthContext();
  if (!authContext) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canWriteNotes(authContext)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const markdown = typeof body?.body === "string" ? body.body : null;
  if (markdown === null || markdown.length > NOTE_BODY_MAX_LENGTH) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  return NextResponse.json({ html: renderNoteHtml(markdown) });
});
