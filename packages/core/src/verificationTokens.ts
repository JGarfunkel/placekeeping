import { db, verificationTokens } from "@placekeeping/db";
import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";

export type VerificationEntityType = "user" | "steward";

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

// The `tx` handle db.transaction(async (tx) => ...) passes to its callback
// -- structurally a subset of `db` (no $client), so accepting either as the
// executor lets createVerificationToken join an existing transaction.
type TransactionCallback = Parameters<typeof db.transaction>[0];
type Tx = TransactionCallback extends (tx: infer T, ...rest: never[]) => unknown
  ? T
  : never;

// executor defaults to `db` but accepts a `tx` handle too, so callers that
// need the token row to commit atomically alongside other inserts (e.g. a
// new steward + its first stewardMembers row) can pass their transaction.
export async function createVerificationToken(
  entityType: VerificationEntityType,
  entityId: string,
  executor: typeof db | Tx = db,
  ttlMs: number = DEFAULT_TTL_MS,
) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + ttlMs);
  await executor
    .insert(verificationTokens)
    .values({ entityType, entityId, token, expiresAt });
  return { token, expiresAt };
}

// Deletes the row on lookup (single-use) and reports why it's unusable, if
// so. Callers distinguish "no such token" from "expired" so they can decide
// whether an already-verified entity should be treated as a no-op success.
export async function consumeVerificationToken(
  token: string,
): Promise<
  | { entityType: VerificationEntityType; entityId: string }
  | { expired: true }
  | null
> {
  const [row] = await db
    .select()
    .from(verificationTokens)
    .where(eq(verificationTokens.token, token))
    .limit(1);
  if (!row) return null;

  await db.delete(verificationTokens).where(eq(verificationTokens.id, row.id));

  if (row.expiresAt < new Date()) return { expired: true };
  return { entityType: row.entityType, entityId: row.entityId };
}
