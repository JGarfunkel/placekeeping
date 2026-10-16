import { getTaskProvider } from "@placekeeping/core";
import { taskCommentSchema } from "@placekeeping/shared-types";
import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/apiError";
import { requireApiAuth } from "@/lib/integrationAuth";

// Only native comments can be edited or deleted from Placekeeping, so the
// provider segment must be "native" (kept for a uniform path shape).
type Params = { params: Promise<{ provider: string; taskId: string; commentId: string }> };

export const PATCH = withApiErrorHandling(async (request: NextRequest, { params }: Params) => {
  const auth = await requireApiAuth();
  if ("response" in auth) return auth.response;
  const { provider: raw, commentId } = await params;
  const provider = getTaskProvider("native");
  if (raw !== "native" || !provider.editComment) {
    return NextResponse.json({ error: "Not supported" }, { status: 400 });
  }
  const parsed = taskCommentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  await provider.editComment(auth.ctx, commentId, parsed.data.text);
  return NextResponse.json({ ok: true });
});

export const DELETE = withApiErrorHandling(async (_req: NextRequest, { params }: Params) => {
  const auth = await requireApiAuth();
  if ("response" in auth) return auth.response;
  const { provider: raw, commentId } = await params;
  const provider = getTaskProvider("native");
  if (raw !== "native" || !provider.deleteComment) {
    return NextResponse.json({ error: "Not supported" }, { status: 400 });
  }
  await provider.deleteComment(auth.ctx, commentId);
  return NextResponse.json({ ok: true });
});
