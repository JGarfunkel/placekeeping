import { getStateConfig, type MultiPolygonGeometry } from "@placekeeping/shared-types";
import { describe, expect, it } from "vitest";
import { computeShapeFlag, outFieldsFor, toParcelDto } from "./parcels";

const CONFIGURED_STATES = ["ny", "nj", "ma"] as const;

describe("outFieldsFor -- owner-data exclusion", () => {
  for (const stateCode of CONFIGURED_STATES) {
    const config = getStateConfig(stateCode)?.parcels;
    if (!config) continue;

    it(`${stateCode}: never requests an owner-shaped field name`, () => {
      const requested = outFieldsFor(config.fields).split(",");
      for (const field of requested) {
        expect(field.toUpperCase()).not.toMatch(/OWNER/);
      }
    });
  }
});

describe("toParcelDto -- owner-data exclusion", () => {
  // Both NJ and MA's real parcel services return owner/assessment fields
  // alongside the legitimate ones by default (confirmed live) -- this is
  // the actual guarantee: toParcelDto only ever reads the fields named in
  // a state's ParcelFieldMap, so owner data never reaches our DTO/DB/client
  // regardless of what the raw response contains.
  const rawPropertiesWithOwnerData: Record<string, unknown> = {
    OWNER_NAME: "JOHN DOE",
    OWNER1: "JOHN DOE",
    OWN_ADDR: "123 MAIN ST",
    OWN_CO: "DOE HOLDINGS LLC",
    PRIMARY_OWNER: "JOHN DOE",
    LAND_VAL: 500000,
    TOTAL_VAL: 750000,
  };

  for (const stateCode of CONFIGURED_STATES) {
    const config = getStateConfig(stateCode)?.parcels;
    if (!config) continue;

    it(`${stateCode}: never surfaces owner data even when present in the raw response`, () => {
      const dto = toParcelDto(config.fields, rawPropertiesWithOwnerData);
      const serialized = JSON.stringify(dto).toUpperCase();
      expect(serialized).not.toContain("JOHN DOE");
      expect(serialized).not.toContain("123 MAIN ST");
      expect(serialized).not.toContain("DOE HOLDINGS");
      expect(serialized).not.toContain("500000");
      expect(serialized).not.toContain("750000");
    });
  }

  it("MA: leaves county/municipality null (no name field on the parcel layer)", () => {
    const maFields = getStateConfig("ma")!.parcels!.fields;
    const dto = toParcelDto(maFields, { LOC_ID: "M_1_2", TOWN_ID: 1 });
    expect(dto.countyName).toBeNull();
    expect(dto.muniName).toBeNull();
  });
});

describe("toParcelDto -- vintage year", () => {
  it("reads vintageYearField directly when present (MA's FY)", () => {
    const maFields = getStateConfig("ma")!.parcels!.fields;
    const dto = toParcelDto(maFields, { LOC_ID: "M_1_2", FY: 2024 });
    expect(dto.rollYr).toBe(2024);
  });

  it("derives a year from vintageDateField when no int field exists (NJ's PCL_LASTUPD)", () => {
    const njFields = getStateConfig("nj")!.parcels!.fields;
    const dto = toParcelDto(njFields, { PAMS_PIN: "1_2_3", PCL_LASTUPD: "2023-06-15" });
    expect(dto.rollYr).toBe(2023);
  });

  it("falls back to the current year when neither is present -- never null", () => {
    // A null rollYr would silently duplicate rows on every re-fetch instead
    // of updating in place, since Postgres unique indexes treat NULL as
    // never-equal (see cacheParcel's natural key).
    const dto = toParcelDto({ externalId: "ID" }, { ID: "x" });
    expect(dto.rollYr).toBe(new Date().getFullYear());
  });
});

// Ring generators for computeShapeFlag's fixtures below. `center` is a
// realistic NY latitude/longitude so the meters<->degrees conversion is
// representative; both approximate meters the same simple way computeShapeFlag's
// haversine helper effectively does at this scale.
function circleRing(
  center: [number, number],
  radiusMeters: number,
  vertexCount: number,
): number[][] {
  const [lng0, lat0] = center;
  const metersPerDegLat = 111320;
  const metersPerDegLng = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const points: number[][] = [];
  for (let i = 0; i <= vertexCount; i++) {
    const angle = (2 * Math.PI * i) / vertexCount;
    const dLat = (radiusMeters * Math.sin(angle)) / metersPerDegLat;
    const dLng = (radiusMeters * Math.cos(angle)) / metersPerDegLng;
    points.push([lng0 + dLng, lat0 + dLat]);
  }
  return points;
}

function multiPolygon(ring: number[][]): MultiPolygonGeometry {
  return { type: "MultiPolygon", coordinates: [[ring]] };
}

const NY_CENTER: [number, number] = [-73.776, 41.156];

describe("computeShapeFlag", () => {
  it("flags a boundary with many closely-spaced vertices (road-hugging curve)", () => {
    // ~8.9m average segment over 100 vertices matches the real New Castle,
    // NY town hall parcel (100.11-2-26) this heuristic was calibrated
    // against: its frontage traces a curving road rather than straight lot
    // lines. Circumference/vertexCount here lands in the same range.
    const ring = circleRing(NY_CENTER, 142, 100);
    expect(computeShapeFlag(multiPolygon(ring))).toBe(true);
  });

  it("does not flag an ordinary few-vertex parcel, even if small", () => {
    // A simple rectangle: 4 corners, well under SHAPE_FLAG_MIN_VERTICES.
    // Guards against flagging a tiny parcel whose few segments are short
    // only because the parcel itself is tiny.
    const ring = [
      [NY_CENTER[0], NY_CENTER[1]],
      [NY_CENTER[0] + 0.0005, NY_CENTER[1]],
      [NY_CENTER[0] + 0.0005, NY_CENTER[1] + 0.0005],
      [NY_CENTER[0], NY_CENTER[1] + 0.0005],
      [NY_CENTER[0], NY_CENTER[1]],
    ];
    expect(computeShapeFlag(multiPolygon(ring))).toBe(false);
  });

  it("does not flag a many-vertex parcel with ordinary-length segments", () => {
    // Same vertex count as the flagged fixture, but a large enough radius
    // that each segment averages well over 15m -- e.g. a big, gently
    // curving natural boundary rather than a tightly-traced road edge.
    const ring = circleRing(NY_CENTER, 800, 100);
    expect(computeShapeFlag(multiPolygon(ring))).toBe(false);
  });
});
