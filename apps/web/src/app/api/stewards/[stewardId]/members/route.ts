import {
  addStewardMember,
  getStewardByStewardId,
  getUserByEmail,
  isStewardGroupAdmin,
  listStewardMembers,
} from "@placekeeping/core";
import { addStewardMemberSchema } from "@placekeeping/shared-types";
import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/apiError";
import { getAuthContext } from "@/lib/session";

type Params = { params: Promise<{ stewardId: string }> };

// Public -- a group's roster is meant to be visible on its steward page.
export const GET = withApiErrorHandling(
  async (_request: NextRequest, { params }: Params) => {
    const { stewardId } = await params;
    const steward = await getStewardByStewardId(stewardId);
    if (!steward) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const members = await listStewardMembers(stewardId);
    return NextResponse.json({ members });
  },
);

export const POST = withApiErrorHandling(
  async (request: NextRequest, { params }: Params) => {
    const authContext = await getAuthContext();
    if (!authContext) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { stewardId } = await params;
    const authorized =
      authContext.isSystemAdmin ||
      (await isStewardGroupAdmin(authContext.userId, stewardId));
    if (!authorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const steward = await getStewardByStewardId(stewardId);
    if (!steward) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    const parsed = addStewardMemberSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const user = await getUserByEmail(parsed.data.email);
    if (!user) {
      return NextResponse.json(
        { error: "No Atlas account found for that email" },
        { status: 404 },
      );
    }

    const member = await addStewardMember(
      stewardId,
      user.userId,
      parsed.data.role,
      authContext.userId,
    );
    return NextResponse.json({ member }, { status: 201 });
  },
);
