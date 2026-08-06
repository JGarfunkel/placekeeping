// One-off/rerunnable maintenance script: for every existing spot, actually
// GIS-resolves its country/state/county/municipality/postalCity territories
// (the same resolveCountry/resolveState/resolveMunicipality calls a real
// page visit would trigger) rather than just bumping the cheap, unresolved
// raw path adjustTerritoryCounts uses on a normal spot save. That's the
// difference from a plain adjustTerritoryCounts replay: this is what
// actually fills in `type` and lands counts on the canonical, always-
// suffixed level-2 path (e.g. "-town", "-village") instead of the spot's
// raw, possibly-unsuffixed locality text.
//
// Safe to rerun: clears every row from subdivisions first, so a stale path
// (e.g. a spot's municipality was renamed, or an old unsuffixed row is
// superseded by a newly-resolved canonical one) can't linger as dead weight
// -- everything gets rebuilt from the spots table, the actual source of
// truth. The cost is that a rerun redoes every GIS lookup from scratch
// (nothing left in the DB to short-circuit resolveMunicipality's cache
// check), same trade-off the table's own truncating migration made.
//
// Known limitation, unchanged from the live spot-save path: a municipality/
// postalCity only resolves when its raw text matches a real NY civil-
// boundary or nationwide ZIP name exactly (mod dash/space); a non-NY state,
// an ambiguous name, or a spelling that doesn't match GIS's NAME field falls
// back to the old unresolved (type=null, unsuffixed) path -- logged below,
// not silently dropped.
import { db, spots, subdivisions } from "@placekeeping/db";
import type { MunicipalityType } from "./territory";
import {
  bumpTerritoryCount,
  categoryKey,
  countyPathSegment,
  resolveCountry,
  resolveMunicipality,
  resolveState,
  shouldIncludePostalCandidate,
  type TerritoryPathEntry,
  type TerritoryResolution,
} from "./territory";
import { slugify } from "./slug";

type SpotRow = {
  spotId: number;
  state: string | null;
  county: string | null;
  municipality: string | null;
  postalCity: string | null;
  stewardId: string | null;
  purpose: string | null;
};

const counts = { resolved: 0, ambiguous: 0, unresolved: 0 };

async function bumpResolved(resolution: TerritoryResolution, category: string, delta: number) {
  await bumpTerritoryCount(
    {
      path: resolution.path,
      level: resolution.level,
      placeholderName: resolution.name,
      county: resolution.county,
      type: resolution.type,
    },
    category,
    delta,
  );
}

async function bumpUnresolved(
  entry: Omit<TerritoryPathEntry, "type">,
  category: string,
  delta: number,
) {
  await bumpTerritoryCount(entry, category, delta);
}

async function processSpot(spot: SpotRow) {
  const category = categoryKey(spot);

  const country = await resolveCountry("us");
  if (country) await bumpResolved(country, category, 1);

  if (!spot.state) return;
  const stateSlug = slugify(spot.state);

  const state = await resolveState("us", stateSlug);
  if (state) {
    await bumpResolved(state, category, 1);
  } else {
    await bumpUnresolved(
      { path: `us/${stateSlug}`, level: 1, placeholderName: spot.state, county: null },
      category,
      1,
    );
  }

  if (spot.county) {
    const countyMc = countyPathSegment(spot.county);
    const resolution = await resolveMunicipality("us", stateSlug, countyMc);
    if (resolution && !("ambiguous" in resolution)) {
      counts.resolved++;
      await bumpResolved(resolution, category, 1);
    } else {
      if (resolution && "ambiguous" in resolution) counts.ambiguous++;
      else counts.unresolved++;
      // A county's type is certain even without a GIS match -- record it.
      await bumpTerritoryCount(
        {
          path: `us/${stateSlug}/${countyMc}`,
          level: 2,
          placeholderName: spot.county,
          county: null,
          type: "county",
        },
        category,
        1,
      );
    }
  }

  const municipalitySlug = spot.municipality ? slugify(spot.municipality) : "";
  if (municipalitySlug) {
    const result = await resolveMunicipality("us", stateSlug, municipalitySlug);
    if (result && !("ambiguous" in result)) {
      counts.resolved++;
      await bumpResolved(result, category, 1);
    } else {
      if (result && "ambiguous" in result) {
        counts.ambiguous++;
        console.warn(
          `  spot ${spot.spotId}: municipality "${spot.municipality}" is ambiguous in ${stateSlug} -- left unresolved`,
        );
      } else {
        counts.unresolved++;
        console.warn(
          `  spot ${spot.spotId}: municipality "${spot.municipality}" didn't match any GIS boundary -- left unresolved`,
        );
      }
      await bumpUnresolved(
        {
          path: `us/${stateSlug}/${municipalitySlug}`,
          level: 2,
          placeholderName: spot.municipality as string,
          county: spot.county,
        },
        category,
        1,
      );
    }
  }

  const postalSlug = spot.postalCity ? slugify(spot.postalCity) : "";
  if (postalSlug && postalSlug !== municipalitySlug) {
    const result = await resolveMunicipality("us", stateSlug, postalSlug);
    const resolvedType =
      result && !("ambiguous" in result) ? (result.type as MunicipalityType | null) : null;
    const include = shouldIncludePostalCandidate(resolvedType);

    if (result && !("ambiguous" in result)) {
      counts.resolved++;
    } else if (result && "ambiguous" in result) {
      counts.ambiguous++;
    } else {
      counts.unresolved++;
    }

    if (include) {
      if (result && !("ambiguous" in result)) {
        await bumpResolved(result, category, 1);
      } else {
        if (result && "ambiguous" in result) {
          console.warn(
            `  spot ${spot.spotId}: postalCity "${spot.postalCity}" is ambiguous in ${stateSlug} -- left unresolved`,
          );
        }
        await bumpUnresolved(
          {
            path: `us/${stateSlug}/${postalSlug}`,
            level: 2,
            placeholderName: spot.postalCity as string,
            county: spot.county,
          },
          category,
          1,
        );
      }
    }
  }
}

async function main() {
  console.log("Clearing subdivisions...");
  await db.delete(subdivisions);

  const rows: SpotRow[] = await db
    .select({
      spotId: spots.spotId,
      state: spots.state,
      county: spots.county,
      municipality: spots.municipality,
      postalCity: spots.postalCity,
      stewardId: spots.stewardId,
      purpose: spots.purpose,
    })
    .from(spots);

  console.log(`Recomputing subdivisions for ${rows.length} spot(s)...`);

  let done = 0;
  for (const row of rows) {
    try {
      await processSpot(row);
    } catch (err) {
      console.error(`  spot ${row.spotId} failed:`, err);
    }
    done += 1;
    if (done % 10 === 0 || done === rows.length) {
      console.log(`  ${done}/${rows.length}`);
    }
  }

  console.log(
    `Done. Locality lookups -- resolved: ${counts.resolved}, ambiguous: ${counts.ambiguous}, unresolved: ${counts.unresolved}.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
