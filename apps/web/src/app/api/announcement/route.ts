import { checkDatabaseLocalConnection, RunningState } from "@placekeeping/db";
import type { AnnouncementStatus } from "@placekeeping/shared-types";
import { NextResponse } from "next/server";

interface Announcement {
  status: AnnouncementStatus;
  message: string;
}

const ANNOUNCEMENTS: Partial<Record<RunningState, Announcement>> = {
  [RunningState.Local]: { status: "log", message: "Local using Local Database" },
  [RunningState.LocalProdDb]: { status: "warn", message: "Local using Prod Database" },
  // RunningState.Prod: no announcement.
};

export async function GET() {
  const announcement = ANNOUNCEMENTS[checkDatabaseLocalConnection()] ?? null;
  return NextResponse.json({
    status: announcement?.status ?? null,
    message: announcement?.message ?? null,
  });
}
