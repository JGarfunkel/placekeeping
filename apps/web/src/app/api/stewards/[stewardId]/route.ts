import {
  getStewardByIdForPublic,
  getStewardByStewardId,
  isStewardGroupAdmin,
  updateSteward,
} from "@placekeeping/core";
import { updateStewardSchema } from "@placekeeping/shared-types";
import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/apiError";
import { getAuthContext } from "@/lib/session";

type Params = { params: Promise<{ stewardId: string }> };

export const GET = withApiErrorHandling(
  async (_request: NextRequest, { params }: Params) => {
    const { stewardId } = await params;
    const steward = await getStewardByIdForPublic(stewardId);
    if (!steward) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({
      steward: {
        stewardId: steward.stewardId,
        slug: steward.slug,
        name: steward.name,
        type: steward.type,
        url: steward.url,
        logoUrl: steward.logoUrl,
        publicDisplay: steward.publicDisplay,
        level: steward.level,
        createdAt: steward.createdAt.toISOString(),
      },
    });
  },
);

// Edits a steward's profile fields (not type -- see UpdateStewardInput).
// Authorized for system admins, the individual owner, or a group admin.
export const PATCH = withApiErrorHandling(
  async (request: NextRequest, { params }: Params) => {
    const authContext = await getAuthContext();
    if (!authContext) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { stewardId } = await params;
    const authorized =
      authContext.isSystemAdmin ||
      authContext.stewardId === stewardId ||
      (await isStewardGroupAdmin(authContext.userId, stewardId));
    if (!authorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const existing = await getStewardByStewardId(stewardId);
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    const parsed = updateStewardSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const steward = await updateSteward(
      stewardId,
      parsed.data,
      authContext.userId,
    );
    return NextResponse.json({
      steward: {
        stewardId: steward.stewardId,
        slug: steward.slug,
        name: steward.name,
        type: steward.type,
        url: steward.url,
        contact: steward.contact,
        logoUrl: steward.logoUrl,
        publicDisplay: steward.publicDisplay,
        level: steward.level,
        createdAt: steward.createdAt.toISOString(),
      },
    });
  },
);
