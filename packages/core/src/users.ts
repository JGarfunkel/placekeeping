import { db, users } from "@placekeeping/db";
import type { UpdateUserProfileInput } from "@placekeeping/shared-types";
import { desc, eq, sql } from "drizzle-orm";
import { diffFields, logEvent, snapshotToChanges } from "./events";
import { checkPhotoUrls } from "./photoModeration";
import { isOwnStorageUrl } from "./photoStorage";
import { generateUsername } from "./username";

export async function getOrCreateUserByFirebaseUid(params: {
  firebaseUid: string;
  name: string;
  email?: string | null;
}) {
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.firebaseUid, params.firebaseUid))
    .limit(1);
  if (existing) return existing;

  const name = params.name || "New User";
  // No sign-up UI to pick a handle yet, so seed one from the display name.
  // The user can rename it later once that UI exists --
  // generateUsername's excludeUserId param supports that update.
  const username = await generateUsername(name);

  const [created] = await db
    .insert(users)
    .values({
      firebaseUid: params.firebaseUid,
      name,
      username,
      email: params.email ?? null,
    })
    .returning();
  await logEvent({
    entityType: "user",
    entityId: created.userId,
    action: "create",
    userId: created.userId,
    changes: snapshotToChanges(
      { name: created.name, username: created.username, email: created.email },
      "create",
    ),
  });
  return created;
}

export async function getUserByFirebaseUid(firebaseUid: string) {
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.firebaseUid, firebaseUid))
    .limit(1);
  return row ?? null;
}

export async function getUserByUserId(userId: string) {
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.userId, userId))
    .limit(1);
  return row ?? null;
}

// Case-insensitive, matching the users_username_lower_idx uniqueness rule.
export async function getUserByUsername(username: string) {
  const [row] = await db
    .select()
    .from(users)
    .where(eq(sql`lower(${users.username})`, username.toLowerCase()))
    .limit(1);
  return row ?? null;
}

// Used by the add-group-member-by-email flow: the target must already have
// an Atlas account (have logged in at least once with that email on file).
export async function getUserByEmail(email: string) {
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return row ?? null;
}

// Backs the admin dashboard's recent-activity log (apps/web /admin).
export async function listRecentUsers(limit = 10) {
  return db
    .select({
      userId: users.userId,
      username: users.username,
      name: users.name,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt))
    .limit(limit);
}

// Backs the self-service PATCH /api/users/me: username and/or photoUrl,
// each independently optional so a photo-only or username-only save doesn't
// have to resend the other. Username format is validated by the caller
// against usernameSchema before this runs; the uniqueness check here is a
// pre-flight for a friendly error message -- users_username_lower_idx is the
// actual guarantee, same belt-and-suspenders pattern as generateUsername's
// collision loop.
export async function updateUserProfile(
  userId: string,
  input: UpdateUserProfileInput,
) {
  if (input.username !== undefined) {
    const existing = await getUserByUsername(input.username);
    if (existing && existing.userId !== userId) {
      return { ok: false as const, error: "That username is already taken" };
    }
  }

  // Photos uploaded via POST /api/photos are already moderated at upload
  // time (see checkPhotoBytes in that route); only a pasted external URL
  // needs checking here -- same convention as createObservation's photoUrls.
  if (input.photoUrl && !isOwnStorageUrl(input.photoUrl)) {
    await checkPhotoUrls([input.photoUrl]);
  }

  const [current] = await db
    .select({ username: users.username, photoUrl: users.photoUrl })
    .from(users)
    .where(eq(users.userId, userId))
    .limit(1);

  const [updated] = await db
    .update(users)
    .set({
      ...(input.username !== undefined ? { username: input.username } : {}),
      ...(input.photoUrl !== undefined ? { photoUrl: input.photoUrl } : {}),
      updatedAt: new Date(),
    })
    .where(eq(users.userId, userId))
    .returning();

  if (current && updated) {
    const changes = diffFields(
      current as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
      input as Record<string, unknown>,
    );
    if (changes) {
      await logEvent({
        entityType: "user",
        entityId: userId,
        action: "update",
        userId,
        changes,
      });
    }
  }
  return { ok: true as const, user: updated };
}
