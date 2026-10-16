import { runTaskSync } from "@placekeeping/core";
import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/apiError";
import { isAsanaEnabled } from "@/lib/asana";

function validSecret(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Called roughly hourly by Cloud Scheduler with `Authorization: Bearer
// $CRON_SECRET`: retries failed pushes of native tasks to Asana, then pulls
// Asana-side edits back. Idempotent, so extra or retried calls are harmless.
export const POST = withApiErrorHandling(async (request: NextRequest) => {
  if (!isAsanaEnabled()) return new NextResponse(null, { status: 404 });
  if (!validSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await runTaskSync());
});
