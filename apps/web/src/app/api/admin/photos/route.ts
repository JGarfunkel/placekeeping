import { listAdminPhotos } from "@placekeeping/core";
import { NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/apiError";
import { requireSystemAdminApi } from "@/lib/adminAuth";

export const GET = withApiErrorHandling(async () => {
  const denied = await requireSystemAdminApi();
  if (denied) return denied;
  return NextResponse.json({ photos: await listAdminPhotos() });
});
