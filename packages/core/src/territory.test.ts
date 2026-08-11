import { describe, expect, it } from "vitest";
import {
  type ArcGisFeature,
  type Candidate,
  categoryKey,
  civilBoundaryLayers,
  combineZipFeatures,
  pickWinner,
  populationOf,
  resolveMuniType,
  shouldIncludePostalCandidate,
  stripQualifier,
  sumCounts,
  territoryPathsForSpot,
} from "./territory";

function candidate(overrides: Partial<Candidate> & Pick<Candidate, "type" | "name">): Candidate {
  return {
    county: null,
    population: null,
    geometry: { coordinates: [] },
    ...overrides,
  };
}

describe("stripQualifier", () => {
  it("parses a trailing type qualifier", () => {
    expect(stripQualifier("middletown-city")).toEqual({
      name: "middletown",
      qualifier: "city",
    });
    expect(stripQualifier("middletown-town")).toEqual({
      name: "middletown",
      qualifier: "town",
    });
    expect(stripQualifier("oswego-county")).toEqual({
      name: "oswego",
      qualifier: "county",
    });
  });

  it("leaves an unqualified name untouched", () => {
    expect(stripQualifier("ossining")).toEqual({
      name: "ossining",
      qualifier: null,
    });
  });

  it("treats a canonical cached path (name-type) as qualified", () => {
    // This is intentional: it's the same format resolveMunicipality caches
    // winning resolutions under (e.g. "us/ny/ossining-town"), so a repeat
    // request for the canonical path re-resolves as explicitly qualified.
    expect(stripQualifier("ossining-town")).toEqual({
      name: "ossining",
      qualifier: "town",
    });
  });
});

describe("pickWinner", () => {
  it("returns null when there are no candidates", () => {
    expect(pickWinner([], null)).toBeNull();
  });

  it("returns the sole candidate when there is exactly one match", () => {
    const town = candidate({ type: "town", name: "Bedford", county: "Westchester" });
    expect(pickWinner([town], null)).toEqual(town);
  });

  it("honors an explicit qualifier over any other rule", () => {
    const city = candidate({ type: "city", name: "Oswego", county: "Oswego" });
    const county = candidate({ type: "county", name: "Oswego" });
    expect(pickWinner([city, county], "county")).toEqual(county);
  });

  it("returns null when the qualifier doesn't match any candidate", () => {
    const city = candidate({ type: "city", name: "Rye", county: "Westchester" });
    expect(pickWinner([city], "village")).toBeNull();
  });

  it("prefers a city over a same-named county with no qualifier (New York)", () => {
    const city = candidate({ type: "city", name: "New York", county: null });
    const county = candidate({ type: "county", name: "New York" });
    expect(pickWinner([city, county], null)).toEqual(city);
  });

  it("prefers a city over a same-named county with no qualifier (Oswego)", () => {
    const city = candidate({ type: "city", name: "Oswego", county: "Oswego" });
    const county = candidate({ type: "county", name: "Oswego" });
    expect(pickWinner([city, county], null)).toEqual(city);
  });

  it("falls back to a county when no city/town/village matches", () => {
    const county = candidate({ type: "county", name: "Oswego" });
    expect(pickWinner([county], null)).toEqual(county);
  });

  it("prefers a town over a same-named village inside it (Ossining)", () => {
    const village = candidate({
      type: "village",
      name: "Ossining",
      county: "Westchester",
      population: 25000,
    });
    const town = candidate({
      type: "town",
      name: "Ossining",
      county: "Westchester",
      population: 37000,
    });
    expect(pickWinner([village, town], null)).toEqual(town);
  });

  it("prefers a city over a same-named town in the same county (Rye)", () => {
    const city = candidate({
      type: "city",
      name: "Rye",
      county: "Westchester",
      population: 16000,
    });
    const town = candidate({
      type: "town",
      name: "Rye",
      county: "Westchester",
      population: 46000, // the town outpopulates the city -- must not matter here
    });
    expect(pickWinner([city, town], null)).toEqual(city);
  });

  it("picks the larger by population for a same-named city/town in different counties (Middletown)", () => {
    const city = candidate({
      type: "city",
      name: "Middletown",
      county: "Orange",
      population: 28086,
    });
    const town = candidate({
      type: "town",
      name: "Middletown",
      county: "Delaware",
      population: 5720,
    });
    expect(pickWinner([city, town], null)).toEqual(city);
    expect(pickWinner([town, city], null)).toEqual(city);
  });

  it("is ambiguous for a cross-county city/town collision when population is unknown", () => {
    const city = candidate({ type: "city", name: "Example", county: "A", population: null });
    const town = candidate({ type: "town", name: "Example", county: "B", population: 100 });
    const result = pickWinner([city, town], null);
    expect(result).toEqual({
      ambiguous: true,
      options: [
        { name: "Example", type: "city", county: "A" },
        { name: "Example", type: "town", county: "B" },
      ],
    });
  });

  it("picks the larger by population for two same-type matches across counties", () => {
    const a = candidate({ type: "town", name: "Example", county: "A", population: 500 });
    const b = candidate({ type: "town", name: "Example", county: "B", population: 5000 });
    expect(pickWinner([a, b], null)).toEqual(b);
  });

  it("is ambiguous for a three-way city/town/village name collision", () => {
    const city = candidate({ type: "city", name: "Example", county: "A", population: 1000 });
    const town = candidate({ type: "town", name: "Example", county: "A", population: 2000 });
    const village = candidate({ type: "village", name: "Example", county: "A", population: 300 });
    const result = pickWinner([city, town, village], null);
    expect(result && "ambiguous" in result && result.ambiguous).toBe(true);
  });

  it("picks the larger by population for two same-named boroughs in different counties (NJ)", () => {
    // NJ has no city/town/village nesting the way NY does -- same-type
    // population tiebreak is the branch that actually fires for it.
    const a = candidate({ type: "borough", name: "Example", county: "A", population: 4000 });
    const b = candidate({ type: "borough", name: "Example", county: "B", population: 9000 });
    expect(pickWinner([a, b], null)).toEqual(b);
  });

  it("honors an explicit township qualifier (NJ)", () => {
    const borough = candidate({ type: "borough", name: "Example", county: "A" });
    const township = candidate({ type: "township", name: "Example", county: "A" });
    expect(pickWinner([borough, township], "township")).toEqual(township);
  });
});

describe("resolveMuniType", () => {
  it("returns a fixed type unchanged (NY's per-type layers)", () => {
    expect(resolveMuniType("town", { NAME: "Bedford" })).toBe("town");
  });

  it("maps a raw field value through valueMap (NJ's flat MUN_TYPE layer)", () => {
    const type = { field: "MUN_TYPE", valueMap: { Borough: "borough" as const } };
    expect(resolveMuniType(type, { MUN_TYPE: "Borough" })).toBe("borough");
  });

  it("maps multiple raw values to the same MunicipalityType (MA's TC -> city)", () => {
    const type = { field: "TYPE", valueMap: { C: "city" as const, TC: "city" as const } };
    expect(resolveMuniType(type, { TYPE: "TC" })).toBe("city");
  });

  it("returns null for an unmapped raw value instead of guessing", () => {
    const type = { field: "MUN_TYPE", valueMap: { Borough: "borough" as const } };
    expect(resolveMuniType(type, { MUN_TYPE: "Plantation" })).toBeNull();
  });

  it("returns null when the type field itself is missing", () => {
    const type = { field: "MUN_TYPE", valueMap: { Borough: "borough" as const } };
    expect(resolveMuniType(type, {})).toBeNull();
  });
});

describe("populationOf", () => {
  it("returns null when no population fields are configured", () => {
    expect(populationOf({ POP2020: 5000 }, undefined)).toBeNull();
  });

  it("tries fields in order and returns the first present", () => {
    expect(populationOf({ POP2010: 3000, POP1990: 2000 }, ["POP2020", "POP2010", "POP1990"])).toBe(
      3000,
    );
  });

  it("returns null when none of the configured fields are present", () => {
    expect(populationOf({}, ["POP2020", "POP2010"])).toBeNull();
  });
});

describe("civilBoundaryLayers", () => {
  it("appends a county pseudo-layer, tagged type 'county', when configured (NY)", () => {
    const layers = civilBoundaryLayers({
      url: "https://example.test",
      county: { layerId: 2, nameField: "NAME" },
      municipalities: [{ layerId: 4, nameField: "NAME", type: "city" }],
    });
    expect(layers).toEqual([
      { layerId: 4, nameField: "NAME", type: "city" },
      { layerId: 2, nameField: "NAME", type: "county" },
    ]);
  });

  it("omits the county layer entirely when unset, without erroring", () => {
    const layers = civilBoundaryLayers({
      url: "https://example.test",
      municipalities: [{ layerId: 1, nameField: "TOWN", type: "town" }],
    });
    expect(layers).toEqual([{ layerId: 1, nameField: "TOWN", type: "town" }]);
  });

  it("carries a county layer's own url override through (MA's counties live on a separate service)", () => {
    const layers = civilBoundaryLayers({
      url: "https://example.test/municipalities",
      county: {
        url: "https://example.test/counties",
        layerId: 1,
        nameField: "COUNTY",
      },
      municipalities: [{ layerId: 1, nameField: "TOWN", type: "town" }],
    });
    expect(layers).toContainEqual({
      url: "https://example.test/counties",
      layerId: 1,
      nameField: "COUNTY",
      type: "county",
    });
  });
});

describe("categoryKey", () => {
  it("marks a spot with a stewardId as stewarded", () => {
    expect(categoryKey({ stewardId: "abc", purpose: "garden" })).toBe(
      "stewarded-garden",
    );
  });

  it("marks a spot without a stewardId as unstewarded", () => {
    expect(categoryKey({ stewardId: null, purpose: "wild_area" })).toBe(
      "unstewarded-wild_area",
    );
  });

  it("falls back to 'none' when purpose is unset", () => {
    expect(categoryKey({ stewardId: "abc", purpose: null })).toBe(
      "stewarded-none",
    );
  });
});

describe("territoryPathsForSpot", () => {
  const base = {
    state: null,
    county: null,
    municipality: null,
    postalCity: null,
    useMunicipalityForSlug: null,
    stewardId: null,
    purpose: null,
  };

  it("only counts toward 'us' when state is unset", () => {
    expect(territoryPathsForSpot(base)).toEqual([
      { path: "us", level: 0, placeholderName: "United States", county: null, type: "country" },
    ]);
  });

  it("adds a state path when state is set", () => {
    const paths = territoryPathsForSpot({ ...base, state: "NY" });
    expect(paths).toEqual([
      { path: "us", level: 0, placeholderName: "United States", county: null, type: "country" },
      { path: "us/ny", level: 1, placeholderName: "NY", county: null, type: "state" },
    ]);
  });

  it("adds a -county path when county is set", () => {
    const paths = territoryPathsForSpot({
      ...base,
      state: "NY",
      county: "Westchester",
    });
    expect(paths).toContainEqual({
      path: "us/ny/westchester-county",
      level: 2,
      placeholderName: "Westchester",
      county: null,
      type: "county",
    });
  });

  it("adds a single, unconditional entry for municipality alone", () => {
    const paths = territoryPathsForSpot({
      ...base,
      state: "NY",
      municipality: "Town of Ossining",
    });
    const locality = paths.find((p) => p.path === "us/ny/town-of-ossining");
    expect(locality).toBeTruthy();
    expect(locality?.isPostalCandidate).toBeFalsy();
  });

  it("adds a single, unconditional entry for postalCity alone (nothing to defer to)", () => {
    const paths = territoryPathsForSpot({
      ...base,
      state: "NY",
      postalCity: "Ossining",
    });
    const locality = paths.find((p) => p.path === "us/ny/ossining");
    expect(locality).toBeTruthy();
    expect(locality?.isPostalCandidate).toBeFalsy();
  });

  it("case 1 (equivalent): collapses to one entry when municipality and postalCity share a slug", () => {
    const paths = territoryPathsForSpot({
      ...base,
      state: "NY",
      municipality: "Ossining",
      postalCity: "ossining", // same place, different casing
    });
    const localityPaths = paths.filter((p) => p.path === "us/ny/ossining");
    expect(localityPaths).toHaveLength(1);
  });

  it("cases 2/3 (within/expansive): adds a separate, candidate-tagged postalCity entry when it differs", () => {
    const paths = territoryPathsForSpot({
      ...base,
      state: "NY",
      municipality: "Town of Ossining",
      postalCity: "Ossining",
    });
    const municipalityEntry = paths.find((p) => p.path === "us/ny/town-of-ossining");
    const postalEntry = paths.find((p) => p.path === "us/ny/ossining");
    expect(municipalityEntry?.isPostalCandidate).toBeFalsy();
    expect(postalEntry?.isPostalCandidate).toBe(true);
  });

  it("carries the raw county name on both locality entries, for later county-drilldown queries", () => {
    const paths = territoryPathsForSpot({
      ...base,
      state: "NY",
      county: "Westchester",
      municipality: "Town of Ossining",
      postalCity: "Ossining",
    });
    expect(paths.find((p) => p.path === "us/ny/town-of-ossining")?.county).toBe(
      "Westchester",
    );
    expect(paths.find((p) => p.path === "us/ny/ossining")?.county).toBe("Westchester");
  });

  it("includes county and both locality paths when all are set and differ", () => {
    const paths = territoryPathsForSpot({
      ...base,
      state: "NY",
      county: "Westchester",
      municipality: "Town of Ossining",
      postalCity: "Ossining",
    });
    expect(paths.map((p) => p.path)).toEqual([
      "us",
      "us/ny",
      "us/ny/westchester-county",
      "us/ny/town-of-ossining",
      "us/ny/ossining",
    ]);
  });
});

describe("shouldIncludePostalCandidate", () => {
  it("includes when the postalCity name has never been GIS-resolved", () => {
    expect(shouldIncludePostalCandidate(null)).toBe(true);
  });

  it("includes when it's known to be a county or a zip, not a real municipality", () => {
    expect(shouldIncludePostalCandidate("county")).toBe(true);
    expect(shouldIncludePostalCandidate("zip")).toBe(true);
  });

  it("excludes (case 3, expansive) when it's a confirmed city/town/village", () => {
    expect(shouldIncludePostalCandidate("city")).toBe(false);
    expect(shouldIncludePostalCandidate("town")).toBe(false);
    expect(shouldIncludePostalCandidate("village")).toBe(false);
  });
});

describe("combineZipFeatures", () => {
  function zipFeature(overrides: {
    ZIP_CODE: string;
    PO_NAME: string;
    STATE: string;
    POPULATION: number | null;
    coordinates?: unknown;
  }): ArcGisFeature<{
    ZIP_CODE: string;
    PO_NAME: string;
    STATE: string;
    POPULATION: number | null;
  }> {
    const { coordinates, ...properties } = overrides;
    return {
      type: "Feature",
      properties,
      geometry: { coordinates: coordinates ?? [] },
    };
  }

  it("returns null for an empty feature list", () => {
    expect(combineZipFeatures([])).toBeNull();
  });

  it("sums population across every matching ZIP", () => {
    const result = combineZipFeatures([
      zipFeature({ ZIP_CODE: "10562", PO_NAME: "Ossining", STATE: "NY", POPULATION: 25000 }),
      zipFeature({ ZIP_CODE: "10510", PO_NAME: "Ossining", STATE: "NY", POPULATION: 3000 }),
    ]);
    expect(result?.type).toBe("zip");
    expect(result?.name).toBe("Ossining");
    expect(result?.population).toBe(28000);
  });

  it("combines coordinates from every feature into one geometry", () => {
    const result = combineZipFeatures([
      zipFeature({
        ZIP_CODE: "10562",
        PO_NAME: "Ossining",
        STATE: "NY",
        POPULATION: 1,
        coordinates: [[0, 0]],
      }),
      zipFeature({
        ZIP_CODE: "10510",
        PO_NAME: "Ossining",
        STATE: "NY",
        POPULATION: 1,
        coordinates: [[1, 1]],
      }),
    ]);
    expect(result?.geometry.coordinates).toEqual([[[0, 0]], [[1, 1]]]);
  });
});

describe("sumCounts", () => {
  it("sums every category's value", () => {
    expect(sumCounts({ "stewarded-garden": 3, "unstewarded-wild_area": 2 })).toBe(5);
  });

  it("returns 0 for an empty or missing counts object", () => {
    expect(sumCounts({})).toBe(0);
    expect(sumCounts(null)).toBe(0);
    expect(sumCounts(undefined)).toBe(0);
  });
});
