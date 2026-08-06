import { db, users } from "@placekeeping/db";
import { and, eq, ne, sql } from "drizzle-orm";

const MAX_BASE_LENGTH = 34; // leaves room for a "_<suffix>" disambiguator up to username's 40-char max

// Matches the [a-zA-Z0-9_-] username format (usernameSchema in shared-types)
// — no periods, so a username can't be confused with a domain/email
// fragment. Collapses any other run of characters (spaces, periods, etc.)
// to a single underscore rather than dropping it, so "Mary Jane" doesn't
// become the misleadingly different "maryjane".
export function usernameSlugify(value: string): string {
  const base = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^[_-]+|[_-]+$/g, "")
    .slice(0, MAX_BASE_LENGTH);
  return base.length >= 3 ? base : base.padEnd(3, "0");
}

// Derives a unique username from a seed string (e.g. a new user's display
// name), disambiguating collisions with a numeric suffix -- same pattern as
// computeSpotSlug in slug.ts. excludeUserId should be the user's own id on
// update, so it doesn't collide with its own previous username.
export async function generateUsername(
  seed: string,
  excludeUserId?: string,
): Promise<string> {
  const base = usernameSlugify(seed);

  let candidate = base;
  let suffix = 2;
  for (;;) {
    const conditions = [eq(sql`lower(${users.username})`, candidate)];
    if (excludeUserId !== undefined) {
      conditions.push(ne(users.userId, excludeUserId));
    }
    const [existing] = await db
      .select({ userId: users.userId })
      .from(users)
      .where(and(...conditions))
      .limit(1);
    if (!existing) break;
    candidate = `${base}_${suffix}`.slice(0, 40);
    suffix++;
  }

  return candidate;
}
