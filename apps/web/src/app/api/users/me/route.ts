import { updateUserProfile } from "@placekeeping/core";
import { updateUserProfileSchema } from "@placekeeping/shared-types";
import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/apiError";
import { getAuthContext } from "@/lib/session";

export const PATCH = withApiErrorHandling(async (request: NextRequest) => {
  const authContext = await getAuthContext();
  if (!authContext) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateUserProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = await updateUserProfile(authContext.userId, parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }

  return NextResponse.json({
    user: {
      userId: result.user.userId,
      username: result.user.username,
      photoUrl: result.user.photoUrl,
    },
  });
});
