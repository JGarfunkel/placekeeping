import {
  isSuspended,
  listTaskComments,
  postTaskComment,
} from "@placekeeping/core";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withApiErrorHandling } from "@/lib/apiError";
import { requireApiAuth } from "@/lib/integrationAuth";

type Ctx = { params: Promise<{ linkId: string }> };

export const GET = withApiErrorHandling(
  async (_request: NextRequest, { params }: Ctx) => {
    const auth = await requireApiAuth();
    if ("response" in auth) return auth.response;
    const { linkId } = await params;
    const comments = await listTaskComments(auth.ctx.userId, linkId);
    return NextResponse.json({ comments });
  },
);

export const POST = withApiErrorHandling(
  async (request: NextRequest, { params }: Ctx) => {
    const auth = await requireApiAuth();
    if ("response" in auth) return auth.response;
    if (isSuspended(auth.ctx)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const parsed = z
      .object({ text: z.string().trim().min(1).max(10000) })
      .safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const { linkId } = await params;
    await postTaskComment(auth.ctx.userId, linkId, parsed.data.text);
    return NextResponse.json({ ok: true }, { status: 201 });
  },
);
