import { randomUUID } from "node:crypto";
import {
  checkDatabaseConnection,
  db,
  stewards,
  subdivisions,
} from "@placekeeping/db";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { slugify } from "./slug";
import { createGroupSteward } from "./stewards";
import { createSpot, deleteSpot, updateSpot } from "./spots";
import { countyPathSegment, getTerritoryCounts } from "./territory";

// These tests exercise createSpot/updateSpot/deleteSpot end-to-end against a
// real Postgres (the same `db` client the app uses), asserting that
// adjustTerritoryCounts (territory.ts) lands correct per-category counts on
// subdivisions at every level a spot's fields touch. The pure
// helpers this depends on (categoryKey, territoryPathsForSpot,
// shouldIncludePostalCandidate) already have direct unit tests in
// territory.test.ts -- this file covers the DB-round-trip behavior those
// can't reach on their own.
//
// Skips cleanly (rather than failing) when Postgres isn't reachable, so
// `npm test` still passes in an environment without `npm run db:up` having
// been run. Run `npm run db:up && npm run db:migrate` first to include
// these tests.
const dbReachable = (await checkDatabaseConnection()).ok;
const describeIfDb = dbReachable ? describe : describe.skip;

if (!dbReachable) {
  console.warn(
    "[territoryCounts.integration.test] Postgres not reachable at DATABASE_URL -- skipping. Run `npm run db:up` first.",
  );
}

// Randomized per test-run so paths never collide with real or seeded data,
// and assertions can stay delta-based (before/after) since "us"/"us/<state>"
// are otherwise shared with whatever else is in the DB.
function uniqueName(label: string): string {
  return `Test${label}${randomUUID().slice(0, 8)}`;
}

async function countFor(path: string, category: string): Promise<number> {
  const counts = await getTerritoryCounts(path);
  return counts[category] ?? 0;
}

describeIfDb("scoreboard counts (adjustTerritoryCounts via createSpot/updateSpot/deleteSpot)", () => {
  const createdSpotIds: number[] = [];
  const createdStewardIds: string[] = [];
  const createdTerritoryPaths: string[] = [];

  afterEach(async () => {
    for (const spotId of createdSpotIds.splice(0)) {
      await deleteSpot(spotId);
    }
    for (const stewardId of createdStewardIds.splice(0)) {
      await db.delete(stewards).where(eq(stewards.stewardId, stewardId));
    }
    for (const path of createdTerritoryPaths.splice(0)) {
      await db.delete(subdivisions).where(eq(subdivisions.path, path));
    }
  });

  it("bumps every level (country/state/county/municipality/postalCity) by 1 on create, and reverses it on delete", async () => {
    const state = uniqueName("State");
    const county = uniqueName("County");
    const municipality = uniqueName("Muni");
    const postalCity = uniqueName("Postal"); // distinct from municipality -> counted separately (case 2, unresolved)

    const stateSlug = slugify(state);
    const paths = {
      country: "us",
      state: `us/${stateSlug}`,
      county: `us/${stateSlug}/${countyPathSegment(county)}`,
      municipality: `us/${stateSlug}/${slugify(municipality)}`,
      postalCity: `us/${stateSlug}/${slugify(postalCity)}`,
    };
    const category = "unstewarded-garden"; // no steward, purpose "garden"

    const before = {
      country: await countFor(paths.country, category),
      state: await countFor(paths.state, category),
      county: await countFor(paths.county, category),
      municipality: await countFor(paths.municipality, category),
      postalCity: await countFor(paths.postalCity, category),
    };

    const spot = await createSpot(
      {
        name: uniqueName("Spot"),
        latitude: 41.1,
        longitude: -73.9,
        addressVisibility: "public",
        state,
        county,
        municipality,
        postalCity,
        useMunicipalityForSlug: false,
        weedLevel: "minimal",
        educationalComponent: false,
        purpose: "garden",
      },
      null,
    );
    createdSpotIds.push(spot.spotId);

    expect(await countFor(paths.country, category)).toBe(before.country + 1);
    expect(await countFor(paths.state, category)).toBe(before.state + 1);
    expect(await countFor(paths.county, category)).toBe(before.county + 1);
    expect(await countFor(paths.municipality, category)).toBe(before.municipality + 1);
    expect(await countFor(paths.postalCity, category)).toBe(before.postalCity + 1);

    await deleteSpot(spot.spotId);
    createdSpotIds.pop(); // already deleted above -- don't double-delete in afterEach

    expect(await countFor(paths.country, category)).toBe(before.country);
    expect(await countFor(paths.state, category)).toBe(before.state);
    expect(await countFor(paths.county, category)).toBe(before.county);
    expect(await countFor(paths.municipality, category)).toBe(before.municipality);
    expect(await countFor(paths.postalCity, category)).toBe(before.postalCity);
  });

  it("moves the count from unstewarded to stewarded, at every level, when a steward is assigned via update", async () => {
    const state = uniqueName("State");
    const municipality = uniqueName("Muni");
    const stateSlug = slugify(state);
    const countryPath = "us";
    const statePath = `us/${stateSlug}`;
    const municipalityPath = `us/${stateSlug}/${slugify(municipality)}`;

    const steward = await createGroupSteward({
      name: uniqueName("Steward"),
      type: "club",
    });
    createdStewardIds.push(steward.stewardId);

    const spot = await createSpot(
      {
        name: uniqueName("Spot"),
        latitude: 41.2,
        longitude: -73.8,
        addressVisibility: "public",
        state,
        municipality,
        useMunicipalityForSlug: true,
        weedLevel: "minimal",
        educationalComponent: false,
        purpose: "wild_area",
      },
      null,
    );
    createdSpotIds.push(spot.spotId);

    const unstewardedCategory = "unstewarded-wild_area";
    const stewardedCategory = "stewarded-wild_area";

    for (const path of [countryPath, statePath, municipalityPath]) {
      expect(await countFor(path, unstewardedCategory)).toBe(1);
      expect(await countFor(path, stewardedCategory)).toBe(0);
    }

    await updateSpot(spot.spotId, { stewardId: steward.stewardId });

    for (const path of [countryPath, statePath, municipalityPath]) {
      expect(await countFor(path, unstewardedCategory)).toBe(0);
      expect(await countFor(path, stewardedCategory)).toBe(1);
    }
  });

  it("moves the count from the old state to the new state when a spot's state changes via update, leaving the country total unaffected", async () => {
    const stateA = uniqueName("StateA");
    const stateB = uniqueName("StateB");
    const municipality = uniqueName("Muni");
    const category = "unstewarded-none"; // no steward, no purpose set

    const countryPath = "us";
    const statePathA = `us/${slugify(stateA)}`;
    const statePathB = `us/${slugify(stateB)}`;

    const spot = await createSpot(
      {
        name: uniqueName("Spot"),
        latitude: 41.3,
        longitude: -73.7,
        addressVisibility: "public",
        state: stateA,
        municipality,
        useMunicipalityForSlug: true,
        weedLevel: "minimal",
        educationalComponent: false,
      },
      null,
    );
    createdSpotIds.push(spot.spotId);

    expect(await countFor(countryPath, category)).toBe(1);
    expect(await countFor(statePathA, category)).toBe(1);
    expect(await countFor(statePathB, category)).toBe(0);

    await updateSpot(spot.spotId, { state: stateB });

    expect(await countFor(countryPath, category)).toBe(1); // still under "us" either way
    expect(await countFor(statePathA, category)).toBe(0);
    expect(await countFor(statePathB, category)).toBe(1);
  });

  it("excludes a postalCity from the count once it's already known (case 3) to be a real, separate municipality", async () => {
    const state = uniqueName("State");
    const municipality = uniqueName("Muni");
    const postalCity = uniqueName("Postal");
    const stateSlug = slugify(state);
    const postalPath = `us/${stateSlug}/${slugify(postalCity)}`;
    const category = "unstewarded-none";

    // Seed a resolved row marking postalCity as a known real municipality --
    // this is what a prior page visit to that territory would have written
    // (see resolveMunicipality's cacheResolution), which is exactly the
    // signal getKnownMunicipalityType/shouldIncludePostalCandidate checks.
    await db.insert(subdivisions).values({
      level: 2,
      path: postalPath,
      name: postalCity,
      type: "town",
      spotCounts: {},
    });
    createdTerritoryPaths.push(postalPath);

    const before = await countFor(postalPath, category);

    const spot = await createSpot(
      {
        name: uniqueName("Spot"),
        latitude: 41.4,
        longitude: -73.6,
        addressVisibility: "public",
        state,
        municipality,
        postalCity,
        useMunicipalityForSlug: true,
        weedLevel: "minimal",
        educationalComponent: false,
      },
      null,
    );
    createdSpotIds.push(spot.spotId);

    // Excluded (case 3): the postalCity count must NOT have moved, even
    // though the municipality count did.
    expect(await countFor(postalPath, category)).toBe(before);
    expect(await countFor(`us/${stateSlug}/${slugify(municipality)}`, category)).toBe(1);
  });
});
