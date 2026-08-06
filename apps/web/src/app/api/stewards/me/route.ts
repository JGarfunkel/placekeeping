import {
  createIndividualStewardForUser,
  getStewardByStewardId,
  getUserByUserId,
  listStewardsAdministeredByUser,
  updateSteward,
} from "@placekeeping/core";
import { updateStewardSchema } from "@placekeeping/shared-types";
import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/apiError";
import { getAuthContext } from "@/lib/session";

function serializeSteward(steward: NonNullable<Awaited<ReturnType<typeof getStewardByStewardId>>>) {
  return {
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
  };
}

export const GET = withApiErrorHandling(async () => {
  const authContext = await getAuthContext();
  if (!authContext) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getUserByUserId(authContext.userId);
  if (!user) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const steward = authContext.stewardId
    ? await getStewardByStewardId(authContext.stewardId)
    : null;
  const administeredGroups = await listStewardsAdministeredByUser(
    authContext.userId,
  );

  return NextResponse.json({
    user: {
      userId: user.userId,
      name: user.name,
      email: user.email,
      isSystemAdmin: user.isSystemAdmin,
      level: user.level,
      photoUrl: user.photoUrl,
      createdAt: user.createdAt.toISOString(),
    },
    steward: steward ? serializeSteward(steward) : null,
    administeredGroups,
  });
});

// "Become a steward": self-service, always creates an individual steward.
// Idempotent -- returns the existing one if the caller already has one.
export const POST = withApiErrorHandling(async () => {
  const authContext = await getAuthContext();
  if (!authContext) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (authContext.stewardId) {
    const existing = await getStewardByStewardId(authContext.stewardId);
    return NextResponse.json({ steward: serializeSteward(existing!) });
  }

  const user = await getUserByUserId(authContext.userId);
  const steward = await createIndividualStewardForUser({
    userId: authContext.userId,
    name: user?.name ?? "New Steward",
    photoUrl: user?.photoUrl ?? null,
    email: user?.email ?? null,
  });
  return NextResponse.json(
    { steward: serializeSteward(steward) },
    { status: 201 },
  );
});

export const PATCH = withApiErrorHandling(async (request: NextRequest) => {
  const authContext = await getAuthContext();
  if (!authContext) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!authContext.stewardId) {
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

  const steward = await updateSteward(authContext.stewardId, parsed.data);
  return NextResponse.json({ steward: serializeSteward(steward) });
});
