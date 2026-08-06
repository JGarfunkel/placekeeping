import { config as loadDotenv } from "dotenv";
import { defineConfig } from "vitest/config";

// packages/core/src/territory.ts imports the shared `db` client, which
// throws at module load if DATABASE_URL is unset -- even for tests that
// only exercise pure functions and never touch the DB. Load the same
// .env.local the db/generate/migrate scripts already use (see
// packages/db/package.json) so importing it doesn't require a live
// connection, just a parseable connection string.
loadDotenv({ path: ".env.local" });

export default defineConfig({
  test: {
    include: ["apps/*/src/**/*.test.ts", "packages/*/src/**/*.test.ts"],
  },
});
