// One-off/rerunnable maintenance script: inserts a `photos` row for every
// URL in observations.photoUrls that doesn't already have one. Needed
// because createObservation only started dual-writing into `photos`
// alongside photoUrls partway through the app's history (see the comment on
// the `photos` table in packages/db/src/schema.ts) -- older observations
// have photoUrls but no matching photos rows, so they have no addressable
// photoId for a photo permalink until this runs.
//
// Every URL here already went live on an observation, which only happens
// after passing (or, in "none" moderation mode, skipping) checkPhotoUrls at
// creation time -- so backfilled rows are marked "approved" regardless of
// which mode was active back then; there's nothing left to actually check.
//
// Safe to rerun: only inserts rows for (observationId, url) pairs that don't
// already exist.
import { db, observations, photos } from "@placekeeping/db";
import { sql } from "drizzle-orm";
import { ownStorageKey } from "./photoStorage";

async function main() {
  const rows = await db
    .select({
      observationId: observations.observationId,
      photoUrls: observations.photoUrls,
    })
    .from(observations)
    .where(sql`array_length(${observations.photoUrls}, 1) > 0`);

  console.log(`Checking ${rows.length} observation(s) with photos...`);

  let inserted = 0;
  let skipped = 0;
  for (const row of rows) {
    const existing = await db
      .select({ url: photos.url })
      .from(photos)
      .where(sql`${photos.observationId} = ${row.observationId}`);
    const existingUrls = new Set(existing.map((r) => r.url));

    const missing = row.photoUrls.filter((url) => !existingUrls.has(url));
    if (missing.length === 0) {
      skipped += 1;
      continue;
    }

    await db.insert(photos).values(
      missing.map((url) => ({
        observationId: row.observationId,
        url,
        storageKey: ownStorageKey(url),
        uploadedByUserId: null,
        moderationStatus: "approved" as const,
      })),
    );
    inserted += missing.length;
  }

  console.log(
    `Done. Inserted ${inserted} photo row(s) across ${rows.length - skipped} observation(s); ${skipped} already had matching photos rows.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
