import { db, stewardMembers, stewards } from "@placekeeping/db";
import type {
  CreateGroupStewardInput,
  CreateSelfServiceStewardInput,
  StewardOption,
  UpdateStewardInput,
} from "@placekeeping/shared-types";
import { and, eq, ilike } from "drizzle-orm";
import { debugLog } from "./debug";
import { diffFields, logEvent, snapshotToChanges } from "./events";
import { checkPhotoUrls } from "./photoModeration";
import { isOwnStorageUrl } from "./photoStorage";
import { computeStewardSlug } from "./slug";
import {
  consumeVerificationToken,
  createVerificationToken,
} from "./verificationTokens";

// The individual steward a user personally owns (created via the
// "become a steward" button) -- distinct from groups, which have no owning
// user and are administered through steward_members instead.
export async function getStewardByUserId(userId: string) {
  const [row] = await db
    .select()
    .from(stewards)
    .where(and(eq(stewards.userId, userId), eq(stewards.type, "individual")))
    .limit(1);
  return row ?? null;
}

export async function createIndividualStewardForUser(user: {
  userId: string;
  name: string;
  // Copied straight onto the steward -- both are already moderated as of
  // when they landed on the user row (see updateUserProfile), so no
  // re-check is needed here.
  photoUrl: string | null;
  email: string | null;
}) {
  const existing = await getStewardByUserId(user.userId);
  if (existing) return existing;

  const stewardName = user.name || "New Steward";
  const [created] = await db
    .insert(stewards)
    .values({
      userId: user.userId,
      name: stewardName,
      slug: await computeStewardSlug(stewardName),
      type: "individual",
      logoUrl: user.photoUrl,
      contact: user.email,
      publicDisplay: true,
    })
    .returning();
  debugLog(
    "[stewards] createIndividualStewardForUser saved",
    created.stewardId,
    user.userId,
  );
  await logEvent({
    entityType: "steward",
    entityId: created.stewardId,
    action: "create",
    userId: user.userId,
    changes: snapshotToChanges(created as unknown as Record<string, unknown>, "create"),
  });
  return created;
}

// System-admin-only: groups aren't owned by a single login, so userId is
// never set here -- membership/adminship is tracked via steward_members.
export async function createGroupSteward(
  input: CreateGroupStewardInput,
  actorUserId: string | null = null,
) {
  const [created] = await db
    .insert(stewards)
    .values({
      name: input.name,
      slug: await computeStewardSlug(input.name),
      type: input.type,
      url: input.url ?? null,
      contact: input.contact ?? null,
      publicDisplay: input.publicDisplay ?? true,
    })
    .returning();
  debugLog("[stewards] createGroupSteward saved", created.stewardId);
  await logEvent({
    entityType: "steward",
    entityId: created.stewardId,
    action: "create",
    userId: actorUserId,
    changes: snapshotToChanges(created as unknown as Record<string, unknown>, "create"),
  });
  return created;
}

export async function getStewardByIdForPublic(stewardId: string) {
  const [row] = await db
    .select()
    .from(stewards)
    .where(eq(stewards.stewardId, stewardId))
    .limit(1);
  if (!row || !row.publicDisplay) return null;
  return row;
}

export async function getStewardByStewardId(stewardId: string | null) {
  if (!stewardId) return null;
  const [row] = await db
    .select()
    .from(stewards)
    .where(eq(stewards.stewardId, stewardId))
    .limit(1);
  return row ?? null;
}

// Slug counterparts of the two lookups above -- the preferred way to
// resolve a /stewards/<identifier> URL. See uuidPattern-based dispatch in
// apps/web/src/app/stewards/[identifier].
export async function getStewardBySlugForPublic(slug: string) {
  const [row] = await db
    .select()
    .from(stewards)
    .where(eq(stewards.slug, slug))
    .limit(1);
  if (!row || !row.publicDisplay) return null;
  return row;
}

export async function getStewardBySlug(slug: string) {
  const [row] = await db
    .select()
    .from(stewards)
    .where(eq(stewards.slug, slug))
    .limit(1);
  return row ?? null;
}

// For the spot-owner steward picker (SpotForm) -- not filtered by
// publicDisplay, since assigning stewardship is an internal action, not the
// public steward directory.
export async function searchStewardsByName(
  query: string,
): Promise<StewardOption[]> {
  const rows = await db
    .select({ stewardId: stewards.stewardId, name: stewards.name })
    .from(stewards)
    .where(ilike(stewards.name, `%${query}%`))
    .orderBy(stewards.name)
    .limit(10);
  return rows;
}

// Shared by the self-edit (PATCH /api/stewards/me) and group-admin-edit
// (PATCH /api/stewards/[stewardId]) routes -- both just update the same
// profile fields, type excluded (see UpdateStewardInput).
export async function updateSteward(
  stewardId: string,
  input: UpdateStewardInput,
  actorUserId: string | null = null,
) {
  debugLog("[stewards] updateSteward", stewardId, input);

  // Same convention as updateUserProfile: a logo uploaded via POST
  // /api/photos is already moderated at upload time, only a pasted external
  // URL needs checking here.
  if (input.logoUrl && !isOwnStorageUrl(input.logoUrl)) {
    await checkPhotoUrls([input.logoUrl]);
  }

  const current = await getStewardByStewardId(stewardId);

  const slugField = input.name
    ? { slug: await computeStewardSlug(input.name, stewardId) }
    : {};
  const [updated] = await db
    .update(stewards)
    .set({ ...input, ...slugField, updatedAt: new Date() })
    .where(eq(stewards.stewardId, stewardId))
    .returning();
  debugLog("[stewards] updateSteward saved", stewardId, "->", updated?.stewardId);

  if (current && updated) {
    const changes = diffFields(
      current as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
      input as Record<string, unknown>,
    );
    if (changes) {
      await logEvent({
        entityType: "steward",
        entityId: stewardId,
        action: "update",
        userId: actorUserId,
        changes,
      });
    }
  }
  return updated;
}

// Self-service group creation, open to any authenticated user (unlike
// createGroupSteward above, which is system-admin-only). Assumes the
// creator is affiliated with the group they're naming, so they're inserted
// as its first admin member -- and a verification token is issued in the
// same transaction so the caller can email it without a second write.
export async function createGroupStewardSelfService(
  input: CreateSelfServiceStewardInput,
  creatorUserId: string,
) {
  const slug = await computeStewardSlug(input.name);
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(stewards)
      .values({
        name: input.name,
        slug,
        type: input.type,
        url: input.url ?? null,
        contact: input.contact,
        publicDisplay: input.publicDisplay ?? true,
      })
      .returning();

    await tx.insert(stewardMembers).values({
      stewardId: created.stewardId,
      userId: creatorUserId,
      role: "admin",
    });

    const { token } = await createVerificationToken(
      "steward",
      created.stewardId,
      tx,
    );

    await logEvent(
      {
        entityType: "steward",
        entityId: created.stewardId,
        action: "create",
        userId: creatorUserId,
        changes: snapshotToChanges(
          created as unknown as Record<string, unknown>,
          "create",
        ),
      },
      tx,
    );

    debugLog(
      "[stewards] createGroupStewardSelfService saved",
      created.stewardId,
      "creator",
      creatorUserId,
    );
    return { steward: created, verificationToken: token };
  });
}

// Consumes a steward contact-verification token and, on success, bumps
// level from 0 to 1. Idempotent: clicking the link twice reports
// alreadyVerified rather than an error, since the token row is gone after
// the first successful click but the steward's level already reflects it.
export async function verifyStewardContact(
  stewardId: string,
  token: string,
): Promise<
  | { ok: true; alreadyVerified: boolean }
  | { ok: false; reason: "invalid" | "expired" }
> {
  const steward = await getStewardByStewardId(stewardId);
  if (!steward) return { ok: false, reason: "invalid" };

  const consumed = await consumeVerificationToken(token);
  if (!consumed) {
    return steward.level >= 1
      ? { ok: true, alreadyVerified: true }
      : { ok: false, reason: "invalid" };
  }
  if ("expired" in consumed) return { ok: false, reason: "expired" };
  if (consumed.entityType !== "steward" || consumed.entityId !== stewardId) {
    return { ok: false, reason: "invalid" };
  }

  await db
    .update(stewards)
    .set({ level: 1, updatedAt: new Date() })
    .where(eq(stewards.stewardId, stewardId));
  return { ok: true, alreadyVerified: false };
}
