import { createRecurringTask, isSuspended } from "@placekeeping/core";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withApiErrorHandling } from "@/lib/apiError";
import {
  canManageScope,
  requireApiAuth,
  scopeSchema,
} from "@/lib/integrationAuth";

const bodySchema = z.object({
  scope: scopeSchema,
  title: z.string().trim().min(1).max(500),
  notes: z.string().max(20000).default(""),
  unit: z.enum(["week", "month", "year"]),
  interval: z.number().int().min(1).max(60).default(1),
  firstDueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  leadDays: z.number().int().min(0).max(365).default(30),
});

export const POST = withApiErrorHandling(async (request: NextRequest) => {
  const auth = await requireApiAuth();
  if ("response" in auth) return auth.response;
  if (isSuspended(auth.ctx)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  if (!(await canManageScope(auth.ctx, parsed.data.scope))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const today = new Date().toISOString().slice(0, 10);
  if (parsed.data.firstDueOn < today) {
    return NextResponse.json(
      { error: "The first due date can't be in the past." },
      { status: 400 },
    );
  }
  const recurring = await createRecurringTask({
    ...parsed.data,
    userId: auth.ctx.userId,
  });
  return NextResponse.json({ recurring }, { status: 201 });
});
