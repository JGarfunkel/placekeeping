import {
  createGroupStewardSelfService,
  sendStewardVerificationEmail,
} from "@placekeeping/core";
import { createSelfServiceStewardSchema } from "@placekeeping/shared-types";
import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/apiError";
import { getAppBaseUrl } from "@/lib/appBaseUrl";
import { getAuthContext } from "@/lib/session";

// Any authenticated user, unlike POST /api/stewards (system-admin-only) --
// the creator is assumed to be affiliated with the group they're naming, so
// they're auto-added as its first admin, and a verification email is sent
// to the contact address to move the steward from level 0 to 1.
export const POST = withApiErrorHandling(async (request: NextRequest) => {
  const authContext = await getAuthContext();
  if (!authContext) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createSelfServiceStewardSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { steward, verificationToken } = await createGroupStewardSelfService(
    parsed.data,
    authContext.userId,
  );

  const link = `${getAppBaseUrl()}/api/stewards/${steward.stewardId}/verify?token=${verificationToken}`;
  await sendStewardVerificationEmail(parsed.data.contact, link);

  return NextResponse.json(
    {
      steward: {
        stewardId: steward.stewardId,
        slug: steward.slug,
        name: steward.name,
        type: steward.type,
        url: steward.url,
        contact: steward.contact,
        publicDisplay: steward.publicDisplay,
        level: steward.level,
        createdAt: steward.createdAt.toISOString(),
      },
    },
    { status: 201 },
  );
});
