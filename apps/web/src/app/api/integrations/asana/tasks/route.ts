import { createTaskForSpot, isSuspended } from "@placekeeping/core";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withApiErrorHandling } from "@/lib/apiError";
import { requireApiAuth } from "@/lib/integrationAuth";

const bodySchema = z.object({
  spotId: z.number().int().positive(),
  observationId: z.string().uuid().nullable().default(null),
  name: z.string().trim().min(1).max(500),
  notes: z.string().max(20000).default(""),
  dueOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .default(null),
  photoUrl: z.string().url().nullable().default(null),
});

// Any user with a linked Asana identity in the bound workspace may create a
// task. It is created as that user, so Asana's own project permissions apply.
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
  const link = await createTaskForSpot({
    ...parsed.data,
    userId: auth.ctx.userId,
  });
  return NextResponse.json({ link }, { status: 201 });
});
