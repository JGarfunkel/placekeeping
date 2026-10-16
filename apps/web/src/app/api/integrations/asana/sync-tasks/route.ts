import { isSuspended, queueExistingTasks } from "@placekeeping/core";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withApiErrorHandling } from "@/lib/apiError";
import { canManageScope, requireApiAuth, scopeSchema } from "@/lib/integrationAuth";

const bodySchema = z.object({ scope: scopeSchema });

// Copies the native tasks that already exist at a place to its Asana project
// (new tasks sync on their own). Managers of the place only. The first
// batch is pushed immediately and the rest by the task-sync job.
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
  const queued = await queueExistingTasks(parsed.data.scope, auth.ctx.userId);
  return NextResponse.json({ queued });
});
