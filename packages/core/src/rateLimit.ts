import { db, rateLimits } from "@placekeeping/db";
import { lt, sql } from "drizzle-orm";
import { createHash } from "node:crypto";

// Mapped to a 429 (with Retry-After) in apps/web/src/lib/apiError.ts.
export class RateLimitError extends Error {
  constructor(public retryAfterSeconds: number) {
    super("Too many requests. Please try again later.");
    this.name = "RateLimitError";
  }
}

export const MINUTE_MS = 60 * 1000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

/** Hash a subject (an email, an IP) so raw values aren't stored as keys. */
export function rateLimitSubject(value: string): string {
  return createHash("sha256").update(value.toLowerCase()).digest("hex").slice(0, 32);
}

/**
 * Counts one hit against `bucket:subject` in a fixed window and throws
 * RateLimitError once more than `limit` hits land in it. The hit is counted
 * atomically (single upsert), so concurrent instances can't both slip under.
 */
export async function enforceRateLimit(
  bucket: string,
  subject: string,
  limit: number,
  windowMs: number,
  now = new Date(),
): Promise<void> {
  const windowStartMs = Math.floor(now.getTime() / windowMs) * windowMs;
  const [row] = await db
    .insert(rateLimits)
    .values({
      key: `${bucket}:${subject}`,
      windowStart: new Date(windowStartMs),
      count: 1,
    })
    .onConflictDoUpdate({
      target: [rateLimits.key, rateLimits.windowStart],
      set: { count: sql`${rateLimits.count} + 1` },
    })
    .returning({ count: rateLimits.count });
  if (row.count > limit) {
    const retryAfter = Math.ceil((windowStartMs + windowMs - now.getTime()) / 1000);
    throw new RateLimitError(Math.max(retryAfter, 1));
  }
}

/** Drops windows too old to matter (longest window used is a day). */
export async function purgeRateLimits(now = new Date()): Promise<number> {
  const deleted = await db
    .delete(rateLimits)
    .where(lt(rateLimits.windowStart, new Date(now.getTime() - 2 * DAY_MS)))
    .returning({ key: rateLimits.key });
  return deleted.length;
}
