import { getStateConfig } from "@placekeeping/shared-types";
import { describe, expect, it } from "vitest";
import { outFieldsFor, toParcelDto } from "./parcels";

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
