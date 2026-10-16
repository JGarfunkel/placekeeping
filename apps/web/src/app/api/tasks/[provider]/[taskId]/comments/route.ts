import { getTaskProvider } from "@placekeeping/core";
import { taskCommentSchema, taskProviderKindSchema } from "@placekeeping/shared-types";
import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/apiError";
import { requireApiAuth } from "@/lib/integrationAuth";

type Params = { params: Promise<{ provider: string; taskId: string }> };

function providerFor(raw: string) {
  const kind = taskProviderKindSchema.safeParse(raw);
  return kind.success ? getTaskProvider(kind.data) : null;
}

export const GET = withApiErrorHandling(async (_req: NextRequest, { params }: Params) => {
  const auth = await requireApiAuth();
  if ("response" in auth) return auth.response;
  const { provider: raw, taskId } = await params;
  const provider = providerFor(raw);
  if (!provider) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ comments: await provider.listComments(auth.ctx, taskId) });
});

export const POST = withApiErrorHandling(async (request: NextRequest, { params }: Params) => {
  const auth = await requireApiAuth();
  if ("response" in auth) return auth.response;
  const { provider: raw, taskId } = await params;
  const provider = providerFor(raw);
  if (!provider) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = taskCommentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  await provider.postComment(auth.ctx, taskId, parsed.data.text);
  return NextResponse.json({ ok: true }, { status: 201 });
});
