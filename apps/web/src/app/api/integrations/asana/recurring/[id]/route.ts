import {
  deleteRecurringTask,
  getRecurringTask,
  recurringTaskScope,
  setRecurringTaskStatus,
} from "@placekeeping/core";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withApiErrorHandling } from "@/lib/apiError";
import { canManageScope, requireApiAuth } from "@/lib/integrationAuth";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = withApiErrorHandling(
  async (request: NextRequest, { params }: Ctx) => {
    const auth = await requireApiAuth();
    if ("response" in auth) return auth.response;
    const parsed = z
      .object({ status: z.enum(["active", "paused"]) })
      .safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const { id } = await params;
    const row = await getRecurringTask(id);
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!(await canManageScope(auth.ctx, recurringTaskScope(row)))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    await setRecurringTaskStatus(id, parsed.data.status, auth.ctx.userId);
    return NextResponse.json({ ok: true });
  },
);

export const DELETE = withApiErrorHandling(
  async (_request: NextRequest, { params }: Ctx) => {
    const auth = await requireApiAuth();
    if ("response" in auth) return auth.response;
    const { id } = await params;
    const row = await getRecurringTask(id);
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!(await canManageScope(auth.ctx, recurringTaskScope(row)))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    await deleteRecurringTask(id);
    return NextResponse.json({ ok: true });
  },
);
