import {
  listTasksForTarget,
  nativeTaskProvider,
  type TaskTarget,
} from "@placekeeping/core";
import { createTaskSchema } from "@placekeeping/shared-types";
import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/apiError";
import { requireApiAuth } from "@/lib/integrationAuth";

// GET ?spotId= | ?siteId= | ?observationId= | ?eventId=: the tasks on a place.
// Members and managers only; anyone else gets an empty list, never the tasks.
export const GET = withApiErrorHandling(async (request: NextRequest) => {
  const auth = await requireApiAuth();
  if ("response" in auth) return auth.response;
  const q = new URL(request.url).searchParams;
  const spotId = Number(q.get("spotId"));
  const siteId = Number(q.get("siteId"));
  const observationId = q.get("observationId");
  const eventId = q.get("eventId");

  let target: TaskTarget | null = null;
  if (Number.isInteger(spotId) && spotId > 0) target = { type: "spot", spotId };
  else if (Number.isInteger(siteId) && siteId > 0) target = { type: "site", siteId };
  else if (observationId) target = { type: "observation", observationId };
  else if (eventId) target = { type: "event", eventId };
  if (!target) {
    return NextResponse.json({ error: "A target is required" }, { status: 400 });
  }
  return NextResponse.json(await listTasksForTarget(auth.ctx, target));
});

export const POST = withApiErrorHandling(async (request: NextRequest) => {
  const auth = await requireApiAuth();
  if ("response" in auth) return auth.response;
  const parsed = createTaskSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { target, ...rest } = parsed.data;
  // Always native; a bound Asana project gets a mirrored copy (taskSync).
  const task = await nativeTaskProvider.createTask(auth.ctx, { target, ...rest });
  return NextResponse.json({ task }, { status: 201 });
});
