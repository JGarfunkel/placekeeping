import {
  isStewardGroupAdmin,
  removeStewardMember,
  updateStewardMemberRole,
} from "@placekeeping/core";
import { updateStewardMemberRoleSchema } from "@placekeeping/shared-types";
import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/apiError";
import { getAuthContext } from "@/lib/session";

type Params = { params: Promise<{ stewardId: string; userId: string }> };

async function authorize(stewardId: string) {
  const authContext = await getAuthContext();
  if (!authContext) return null;
  const authorized =
    authContext.isSystemAdmin ||
    (await isStewardGroupAdmin(authContext.userId, stewardId));
  return authorized ? authContext : null;
}

export const PATCH = withApiErrorHandling(
  async (request: NextRequest, { params }: Params) => {
    const { stewardId, userId } = await params;
    if (!(await authorize(stewardId))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const parsed = updateStewardMemberRoleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const result = await updateStewardMemberRole(
      stewardId,
      userId,
      parsed.data.role,
    );
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }
    return NextResponse.json({ member: result.member });
  },
);

export const DELETE = withApiErrorHandling(
  async (_request: NextRequest, { params }: Params) => {
    const { stewardId, userId } = await params;
    if (!(await authorize(stewardId))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await removeStewardMember(stewardId, userId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  },
);
