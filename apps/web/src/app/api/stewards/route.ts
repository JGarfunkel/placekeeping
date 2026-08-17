import { createGroupSteward } from "@placekeeping/core";
import { createGroupStewardSchema } from "@placekeeping/shared-types";
import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/apiError";
import { getAuthContext } from "@/lib/session";

// System-admin-only: group creation isn't self-service. Groups are
// administered via steward_members, not owned by one login.
export const POST = withApiErrorHandling(async (request: NextRequest) => {
  const authContext = await getAuthContext();
  if (!authContext?.isSystemAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createGroupStewardSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const steward = await createGroupSteward(parsed.data, authContext.userId);
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
