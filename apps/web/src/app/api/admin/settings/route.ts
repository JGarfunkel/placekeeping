import { getAppSettings, setWritesPaused } from "@placekeeping/core";
import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/apiError";
import { getAuthContext } from "@/lib/session";

export const GET = withApiErrorHandling(async () => {
  const authContext = await getAuthContext();
  if (!authContext?.isSystemAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await getAppSettings();
  return NextResponse.json({
    settings: {
      writesPaused: settings.writesPaused,
      pausedAt: settings.pausedAt?.toISOString() ?? null,
      pausedByUserId: settings.pausedByUserId,
    },
  });
});

// skipPauseGate: an admin must always be able to reach this route to
// unpause writes, even while writes are paused.
export const PATCH = withApiErrorHandling(
  async (request: NextRequest) => {
    const authContext = await getAuthContext();
    if (!authContext?.isSystemAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (typeof body?.writesPaused !== "boolean") {
      return NextResponse.json(
        { error: "writesPaused (boolean) is required" },
        { status: 400 },
      );
    }

    const settings = await setWritesPaused(
      body.writesPaused,
      authContext.userId,
    );
    return NextResponse.json({
      settings: {
        writesPaused: settings.writesPaused,
        pausedAt: settings.pausedAt?.toISOString() ?? null,
        pausedByUserId: settings.pausedByUserId,
      },
    });
  },
  { skipPauseGate: true },
);
