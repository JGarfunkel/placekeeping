import { db, stewardMembers, stewards, users } from "@placekeeping/db";
import type {
  StewardCandidate,
  StewardMember,
  StewardMemberRole,
} from "@placekeeping/shared-types";
import { and, eq } from "drizzle-orm";
import { logEvent, snapshotToChanges } from "./events";
import { getStewardByUserId } from "./stewards";

export async function listStewardMembers(
  stewardId: string,
): Promise<StewardMember[]> {
  const rows = await db
    .select({
      userId: stewardMembers.userId,
      name: users.name,
      email: users.email,
      role: stewardMembers.role,
      createdAt: stewardMembers.createdAt,
    })
    .from(stewardMembers)
    .innerJoin(users, eq(stewardMembers.userId, users.userId))
    .where(eq(stewardMembers.stewardId, stewardId))
    .orderBy(users.name);
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

// Public counterpart to listStewardMembers: exposes username instead of the
// account's real name/email, same convention as users.username elsewhere
// (see schema.ts comment) -- for the public /stewards/[identifier] roster.
export async function listStewardMembersForPublic(stewardId: string) {
  const rows = await db
    .select({
      userId: stewardMembers.userId,
      username: users.username,
      role: stewardMembers.role,
    })
    .from(stewardMembers)
    .innerJoin(users, eq(stewardMembers.userId, users.userId))
    .where(eq(stewardMembers.stewardId, stewardId))
    .orderBy(users.username);
  return rows;
}

export async function isStewardGroupAdmin(userId: string, stewardId: string) {
  const [row] = await db
    .select()
    .from(stewardMembers)
    .where(
      and(
        eq(stewardMembers.stewardId, stewardId),
        eq(stewardMembers.userId, userId),
        eq(stewardMembers.role, "admin"),
      ),
    )
    .limit(1);
  return !!row;
}

// Groups a user administers (role: "admin"), for the profile page's
// "groups you manage" list.
export async function listStewardsAdministeredByUser(userId: string) {
  const rows = await db
    .select({ stewardId: stewards.stewardId, name: stewards.name })
    .from(stewardMembers)
    .innerJoin(stewards, eq(stewardMembers.stewardId, stewards.stewardId))
    .where(and(eq(stewardMembers.userId, userId), eq(stewardMembers.role, "admin")))
    .orderBy(stewards.name);
  return rows;
}

// Every group a user belongs to, admin or plain member -- unlike
// listStewardsAdministeredByUser above, which only covers the "manage"
// case. Used for the fuller "your groups" listing on the profile page.
export async function listStewardsForUser(userId: string) {
  const rows = await db
    .select({
      stewardId: stewards.stewardId,
      slug: stewards.slug,
      name: stewards.name,
      role: stewardMembers.role,
      publicDisplay: stewards.publicDisplay,
    })
    .from(stewardMembers)
    .innerJoin(stewards, eq(stewardMembers.stewardId, stewards.stewardId))
    .where(eq(stewardMembers.userId, userId))
    .orderBy(stewards.name);
  return rows;
}

// The picker's default candidate list for a user assigning a spot's
// steward: their own individual steward first, then groups they admin,
// then groups they're a plain member of -- in that priority order, since
// that's who they're most likely to be assigning on behalf of.
export async function listCandidateStewardsForUser(
  userId: string,
): Promise<StewardCandidate[]> {
  const [individual, administered, memberOf] = await Promise.all([
    getStewardByUserId(userId),
    listStewardsAdministeredByUser(userId),
    listStewardsForUser(userId),
  ]);

  const seen = new Set<string>();
  const result: StewardCandidate[] = [];

  if (individual) {
    result.push({
      stewardId: individual.stewardId,
      name: individual.name,
      relationship: "individual",
    });
    seen.add(individual.stewardId);
  }
  for (const group of administered) {
    if (seen.has(group.stewardId)) continue;
    result.push({ ...group, relationship: "admin" });
    seen.add(group.stewardId);
  }
  for (const group of memberOf) {
    if (seen.has(group.stewardId) || group.role !== "member") continue;
    result.push({
      stewardId: group.stewardId,
      name: group.name,
      relationship: "member",
    });
    seen.add(group.stewardId);
  }

  return result;
}

export async function addStewardMember(
  stewardId: string,
  userId: string,
  role: StewardMemberRole = "member",
  actorUserId: string | null = null,
) {
  const [created] = await db
    .insert(stewardMembers)
    .values({ stewardId, userId, role })
    .onConflictDoUpdate({
      target: [stewardMembers.stewardId, stewardMembers.userId],
      set: { role },
    })
    .returning();
  await logEvent({
    entityType: "steward_member",
    entityId: `${stewardId}:${userId}`,
    action: "create",
    userId: actorUserId,
    changes: snapshotToChanges({ stewardId, userId, role: created.role }, "create"),
  });
  return created;
}

// Guards against orphaning a group: refuses to demote its last admin.
export async function updateStewardMemberRole(
  stewardId: string,
  userId: string,
  role: StewardMemberRole,
  actorUserId: string | null = null,
) {
  const members = await listStewardMembers(stewardId);
  const target = members.find((m) => m.userId === userId);

  if (role === "member") {
    const adminCount = members.filter((m) => m.role === "admin").length;
    if (target?.role === "admin" && adminCount <= 1) {
      return { ok: false as const, error: "Cannot demote a group's last admin" };
    }
  }

  const [updated] = await db
    .update(stewardMembers)
    .set({ role })
    .where(
      and(eq(stewardMembers.stewardId, stewardId), eq(stewardMembers.userId, userId)),
    )
    .returning();
  if (updated && target && target.role !== updated.role) {
    await logEvent({
      entityType: "steward_member",
      entityId: `${stewardId}:${userId}`,
      action: "update",
      userId: actorUserId,
      changes: { role: { from: target.role, to: updated.role } },
    });
  }
  return { ok: true as const, member: updated ?? null };
}

// Guards against orphaning a group: refuses to remove its last admin.
export async function removeStewardMember(
  stewardId: string,
  userId: string,
  actorUserId: string | null = null,
) {
  const members = await listStewardMembers(stewardId);
  const target = members.find((m) => m.userId === userId);
  if (!target) return { ok: true as const };

  const adminCount = members.filter((m) => m.role === "admin").length;
  if (target.role === "admin" && adminCount <= 1) {
    return { ok: false as const, error: "Cannot remove a group's last admin" };
  }

  await db
    .delete(stewardMembers)
    .where(
      and(eq(stewardMembers.stewardId, stewardId), eq(stewardMembers.userId, userId)),
    );
  await logEvent({
    entityType: "steward_member",
    entityId: `${stewardId}:${userId}`,
    action: "delete",
    userId: actorUserId,
    changes: snapshotToChanges({ stewardId, userId, role: target.role }, "delete"),
  });
  return { ok: true as const };
}
