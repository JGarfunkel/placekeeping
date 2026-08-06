import { createInterface } from "node:readline/promises";
import { eq } from "drizzle-orm";
import { db } from "./client";
import { users } from "./schema";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function main() {
  const identifier = process.argv[2];
  if (!identifier) {
    console.error("Usage: npm run db:set-admin -- <user-id-or-email>");
    process.exit(1);
  }

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

  if (user.isSystemAdmin) {
    console.log("This user is already a system admin. Nothing to do.");
    process.exit(0);
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(
    `Grant system admin to "${user.name}" <${user.email ?? "no email"}>? [y/N] `,
  );
  rl.close();

  if (answer.trim().toLowerCase() !== "y") {
    console.log("Aborted.");
    process.exit(0);
  }

  await db
    .update(users)
    .set({ isSystemAdmin: true, updatedAt: new Date() })
    .where(eq(users.userId, user.userId));

  console.log(`"${user.name}" is now a system admin.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
