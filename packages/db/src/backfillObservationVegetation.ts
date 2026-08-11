// One-off/rerunnable maintenance script: backfills observations.vegetation,
// observations.weedLevel, and observations.stewardId (added in migrations/
// 0001 and 0002) from the spot each observation was logged against, for
// observations recorded before those columns existed on observations
// itself.
//
// Only touches columns that are still null on a given row, so it's safe to
// rerun -- it won't clobber a value an observation already recorded for
// itself (via the app, or a previous run of this script).
import { eq, isNull, or } from "drizzle-orm";
import { db } from "./client";
import { observations, spots } from "./schema";

type SpotInfo = {
  vegetation: string | null;
  weedLevel: string | null;
  stewardId: string | null;
  stewardStart: Date | null;
};

async function main() {
  console.log("Loading spots...");
  const spotRows = await db
    .select({
      spotId: spots.spotId,
      vegetation: spots.vegetation,
      weedLevel: spots.weedLevel,
      stewardId: spots.stewardId,
      stewardStart: spots.stewardStart,
    })
    .from(spots);

  const spotById = new Map<number, SpotInfo>(
    spotRows.map((spot) => [spot.spotId, spot]),
  );
  console.log(`Loaded ${spotById.size} spot(s).`);

  const obsRows = await db
    .select({
      observationId: observations.observationId,
      spotId: observations.spotId,
      observedAt: observations.observedAt,
      vegetation: observations.vegetation,
      weedLevel: observations.weedLevel,
      stewardId: observations.stewardId,
    })
    .from(observations)
    .where(
      or(
        isNull(observations.vegetation),
        isNull(observations.weedLevel),
        isNull(observations.stewardId),
      ),
    );

  console.log(`Checking ${obsRows.length} observation(s)...`);

  let updated = 0;
  let skipped = 0;
  let done = 0;
  for (const obs of obsRows) {
    const spot = spotById.get(obs.spotId);
    if (!spot) {
      console.warn(`  observation ${obs.observationId}: no spot ${obs.spotId} -- skipped`);
      skipped += 1;
    } else {
      const set: Partial<typeof observations.$inferInsert> = {};
      if (obs.vegetation === null) set.vegetation = spot.vegetation;
      if (obs.weedLevel === null) set.weedLevel = spot.weedLevel;
      // Only attributable if the spot's steward start is known and this
      // observation was logged on or after it -- otherwise leave null
      // ("unstewarded then" and "can't tell" are indistinguishable here, see
      // schema.ts).
      if (
        obs.stewardId === null &&
        spot.stewardStart &&
        new Date(`${obs.observedAt}T00:00:00Z`) >= spot.stewardStart
      ) {
        set.stewardId = spot.stewardId;
      }

      if (Object.keys(set).length > 0) {
        await db
          .update(observations)
          .set(set)
          .where(eq(observations.observationId, obs.observationId));
        updated += 1;
      } else {
        skipped += 1;
      }
    }
    done += 1;
    if (done % 50 === 0 || done === obsRows.length) {
      console.log(`  ${done}/${obsRows.length}`);
    }
  }

  console.log(`Done. Updated: ${updated}, skipped: ${skipped}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
