// One-off maintenance script: rewrites stored photo URLs from one public base
// (e.g. https://pub-xxxx.r2.dev) to another (e.g. https://photos.placekeeping.org)
// after R2_PUBLIC_BASE_URL changes. packages/core/src/photoStorage.ts
// ownStorageKey only matches the *current* base, so without this, photos
// uploaded under the old base would be treated as externally pasted URLs.
//
// Usage: rewrite-photo-base-url <oldBase> <newBase> [--apply]
// Dry run by default: prints how many values in each column would change.
// With --apply, runs all updates in one transaction.
//
// Only touches values that start with "<oldBase>/", so external URLs and
// values already on the new base are left alone. Safe to rerun.
import { sql } from "drizzle-orm";
import { db } from "./client";

// Every column that can hold one of our storage URLs. Names are constants
// here, never user input, so sql.raw is safe.
const TEXT_COLUMNS = [
  { table: "photos", column: "url" },
  { table: "users", column: "photo_url" },
  { table: "stewards", column: "logo_url" },
  { table: "spots", column: "cover_photo_url" },
] as const;
const ARRAY_COLUMN = { table: "observations", column: "photo_urls" } as const;

function normalizeBase(value: string | undefined, label: string): string {
  if (!value || !/^https?:\/\//.test(value)) {
    throw new Error(`${label} must be an http(s) origin, got ${JSON.stringify(value)}`);
  }
  return value.replace(/\/+$/, "");
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const [rawOld, rawNew] = args.filter((arg) => !arg.startsWith("--"));
  const oldBase = normalizeBase(rawOld, "oldBase");
  const newBase = normalizeBase(rawNew, "newBase");
  const oldPrefix = `${oldBase}/`;
  console.log(`${apply ? "APPLYING" : "Dry run"}: ${oldBase} -> ${newBase}`);

  await db.transaction(async (tx) => {
    for (const { table, column } of TEXT_COLUMNS) {
      const t = sql.raw(table);
      const c = sql.raw(column);
      const result = apply
        ? await tx.execute(sql`
            UPDATE ${t}
            SET ${c} = ${newBase} || substr(${c}, ${oldBase.length + 1})
            WHERE starts_with(${c}, ${oldPrefix})
          `)
        : await tx.execute(sql`
            SELECT 1 FROM ${t} WHERE starts_with(${c}, ${oldPrefix})
          `);
      console.log(`  ${table}.${column}: ${result.rowCount} row(s)`);
    }

    // observations.photo_urls is text[]; rewrite each element, keep order.
    const t = sql.raw(ARRAY_COLUMN.table);
    const c = sql.raw(ARRAY_COLUMN.column);
    const result = apply
      ? await tx.execute(sql`
          UPDATE ${t}
          SET ${c} = ARRAY(
            SELECT CASE WHEN starts_with(u.url, ${oldPrefix})
                        THEN ${newBase} || substr(u.url, ${oldBase.length + 1})
                        ELSE u.url END
            FROM unnest(${c}) WITH ORDINALITY AS u(url, ord)
            ORDER BY u.ord
          )
          WHERE EXISTS (
            SELECT 1 FROM unnest(${c}) AS e(url) WHERE starts_with(e.url, ${oldPrefix})
          )
        `)
      : await tx.execute(sql`
          SELECT 1 FROM ${t}
          WHERE EXISTS (
            SELECT 1 FROM unnest(${c}) AS e(url) WHERE starts_with(e.url, ${oldPrefix})
          )
        `);
    console.log(`  ${ARRAY_COLUMN.table}.${ARRAY_COLUMN.column}: ${result.rowCount} row(s)`);
  });

  if (!apply) console.log("Dry run only. Re-run with --apply to write these changes.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
