import { createInterface } from "node:readline/promises";
import { eq, ilike } from "drizzle-orm";
import { db } from "./client";
import { stewards, users } from "./schema";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Mirrors LEVEL_LABELS in packages/shared-types/src/enums.ts -- duplicated
// rather than imported so this CLI script doesn't need shared-types as a
// dependency of @placekeeping/db. Falls back to the raw number for anything
// outside this known range.
const LEVEL_LABELS: Record<number, string> = {
  [-1]: "Suspended",
  0: "Unverified",
  1: "Verified member",
  2: "Partner",
};
function levelLabel(level: number): string {
  return LEVEL_LABELS[level] ?? `Level ${level}`;
}

async function main() {
  const [entity, identifier, levelArg] = process.argv.slice(2);
  const level = Number(levelArg);

  if (
    (entity !== "user" && entity !== "steward") ||
    !identifier ||
    !Number.isInteger(level) ||
    level < -1
  ) {
    console.error(
      "Usage: npm run db:set-level -- <user|steward> <id-or-email-or-name> <level>",
    );
    console.error(
      "  level: -1 Suspended, 0 Unverified, 1 Verified member, 2 Partner",
    );
    process.exit(1);
  }

  if (entity === "user") {
    await setUserLevel(identifier, level);
  } else {
    await setStewardLevel(identifier, level);
  }
}

async function setUserLevel(identifier: string, level: number) {
  const [user] = await db
    .select()
    .from(users)
    .where(
      UUID_RE.test(identifier)
        ? eq(users.userId, identifier)
        : eq(users.email, identifier),
    )
    .limit(1);

  if (!user) {
    console.error(`No user found for "${identifier}".`);
    process.exit(1);
  }

  console.log("Found user:");
  console.table([user]);

  if (user.level === level) {
    console.log(`Already at level ${level} (${levelLabel(level)}). Nothing to do.`);
    process.exit(0);
  }

  if (
    !(await confirm(
      `Set "${user.name}"'s level to ${level} (${levelLabel(level)})?`,
    ))
  ) {
    console.log("Aborted.");
    process.exit(0);
  }

  await db
    .update(users)
    .set({ level, updatedAt: new Date() })
    .where(eq(users.userId, user.userId));

  console.log(`"${user.name}" is now level ${level} (${levelLabel(level)}).`);
  process.exit(0);
}

async function setStewardLevel(identifier: string, level: number) {
  const candidates = UUID_RE.test(identifier)
    ? await db
        .select()
        .from(stewards)
        .where(eq(stewards.stewardId, identifier))
        .limit(1)
    : await db
        .select()
        .from(stewards)
        .where(ilike(stewards.name, identifier))
        .limit(2);

  if (candidates.length === 0) {
    console.error(`No steward found for "${identifier}".`);
    process.exit(1);
  }
  if (candidates.length > 1) {
    console.error(
      `Multiple stewards match "${identifier}" -- pass the stewardId instead.`,
    );
    process.exit(1);
  }

  const [steward] = candidates;
  console.log("Found steward:");
  console.table([steward]);

  if (steward.level === level) {
    console.log(`Already at level ${level} (${levelLabel(level)}). Nothing to do.`);
    process.exit(0);
  }

  if (
    !(await confirm(
      `Set "${steward.name}"'s level to ${level} (${levelLabel(level)})?`,
    ))
  ) {
    console.log("Aborted.");
    process.exit(0);
  }

  await db
    .update(stewards)
    .set({ level, updatedAt: new Date() })
    .where(eq(stewards.stewardId, steward.stewardId));

  console.log(`"${steward.name}" is now level ${level} (${levelLabel(level)}).`);
  process.exit(0);
}

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`${question} [y/N] `);
  rl.close();
  return answer.trim().toLowerCase() === "y";
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
