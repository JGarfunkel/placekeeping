// One-off/rerunnable maintenance script: fixes two write-path bugs that
// have since been corrected in spots.ts/territory.ts but left bad data
// behind on existing rows --
//   1. `state` occasionally holds a full state name ("New York") instead of
//      the 2-letter code ("ny") every other consumer (getStateConfig,
//      parcelServiceConfig, isInstitutionalClass, computeSpotSlug) expects --
//      createSpot's parcel-derived fallback used to read a state config's
//      `.name` instead of `.code`. This produces duplicate territory paths
//      ("us/ny" and "us/new-york" for the same state).
//   2. `county` occasionally carries a redundant trailing " County" (Google
//      geocode long_names look like "Westchester County"; parcel-derived
//      data is bare, e.g. "Westchester") -- inconsistent once the
//      subdivisions path already disambiguates via "-county".
//
// A `state` fix also requires recomputing the slug (slugState is derived
// from it, and lives in the same uniqueness key as slugLocality/slug), so
// this reuses computeSpotSlug rather than patching slugState directly.
// `county` isn't part of the slug, so it's a plain column update.
//
// Run this BEFORE `db:backfill-subdivisions` -- that script rebuilds
// `subdivisions` from whatever's currently in `spots`, so it needs to run
// against already-normalized data to produce clean output.
import { db, spots } from "@placekeeping/db";
import { STATE_CONFIGS } from "@placekeeping/shared-types";
import { eq } from "drizzle-orm";
import { computeSpotSlug } from "./slug";
import { normalizeCountyName } from "./territory";

const CODE_BY_LOWER_NAME = new Map(
  Object.values(STATE_CONFIGS).map((config) => [config.name.toLowerCase(), config.code]),
);

type SpotRow = {
  spotId: number;
  name: string;
  state: string | null;
  county: string | null;
  municipality: string | null;
  postalCity: string | null;
  useMunicipalityForSlug: boolean;
};

async function main() {
  const rows: SpotRow[] = await db
    .select({
      spotId: spots.spotId,
      name: spots.name,
      state: spots.state,
      county: spots.county,
      municipality: spots.municipality,
      postalCity: spots.postalCity,
      useMunicipalityForSlug: spots.useMunicipalityForSlug,
    })
    .from(spots);

  console.log(`Checking ${rows.length} spot(s)...`);

  let stateFixed = 0;
  let countyFixed = 0;
  let skipped = 0;
  let done = 0;

  for (const row of rows) {
    const newStateCode = row.state ? CODE_BY_LOWER_NAME.get(row.state.toLowerCase()) : undefined;
    const stateChanged = newStateCode !== undefined && newStateCode !== row.state;

    const newCounty = row.county ? normalizeCountyName(row.county) : row.county;
    const countyChanged = newCounty !== null && newCounty !== row.county;

    if (!stateChanged && !countyChanged) {
      skipped += 1;
    } else {
      const set: Partial<typeof spots.$inferInsert> = {};
      if (countyChanged) set.county = newCounty;

      if (stateChanged) {
        const { slugState, slugLocality, slug } = await computeSpotSlug(
          {
            name: row.name,
            state: newStateCode,
            municipality: row.municipality,
            postalCity: row.postalCity,
            useMunicipalityForSlug: row.useMunicipalityForSlug,
          },
          row.spotId,
        );
        set.state = newStateCode;
        set.slugState = slugState;
        set.slugLocality = slugLocality;
        set.slug = slug;
      }

      await db.update(spots).set(set).where(eq(spots.spotId, row.spotId));
      if (stateChanged) stateFixed += 1;
      if (countyChanged) countyFixed += 1;
    }

    done += 1;
    if (done % 50 === 0 || done === rows.length) {
      console.log(`  ${done}/${rows.length}`);
    }
  }

  console.log(
    `Done. state fixed: ${stateFixed}, county fixed: ${countyFixed}, skipped: ${skipped}.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
