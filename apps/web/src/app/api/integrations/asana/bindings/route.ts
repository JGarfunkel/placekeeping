import { clearBinding, setBinding } from "@placekeeping/core";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withApiErrorHandling } from "@/lib/apiError";
import { canManageScope, requireApiAuth, scopeSchema } from "@/lib/integrationAuth";

const putSchema = z.object({
  scope: scopeSchema,
  identityId: z.string().uuid(),
  remoteProjectId: z.string().min(1),
  remoteSectionId: z.string().min(1).nullable().default(null),
});

const deleteSchema = z.object({ scope: scopeSchema });

export const PUT = withApiErrorHandling(async (request: NextRequest) => {
  const auth = await requireApiAuth();
  if ("response" in auth) return auth.response;
  const parsed = putSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  if (!(await canManageScope(auth.ctx, parsed.data.scope))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await setBinding({ ...parsed.data, userId: auth.ctx.userId });
  return NextResponse.json({ ok: true });
});

export const DELETE = withApiErrorHandling(async (request: NextRequest) => {
  const auth = await requireApiAuth();
  if ("response" in auth) return auth.response;
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  if (!(await canManageScope(auth.ctx, parsed.data.scope))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await clearBinding(parsed.data.scope);
  return NextResponse.json({ ok: true });
});
