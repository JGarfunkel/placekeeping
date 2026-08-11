import type { StateConfig } from "./types";

// Verified live 2026-08 (WebFetch against the actual services, `?f=json`
// on each layer): the "Framework" folder is a MapServer, not FeatureServer,
// but confirmed to support the same /<layer>/query wire format (including
// f=geojson) as NY's FeatureServer -- no special-casing needed.
export const NJ_STATE_CONFIG: StateConfig = {
  code: "nj",
  name: "New Jersey",
  boundingBox: { minLat: 38.9, maxLat: 41.4, minLng: -75.6, maxLng: -73.8 },
  civilBoundaries: {
    url: "https://maps.nj.gov/arcgis/rest/services/Framework/Government_Boundaries/MapServer",
    // Plain name field (e.g. "ESSEX"), matching the parcels layer's own
    // COUNTY field -- GNIS_NAME/COUNTY_LABEL may carry a "County" suffix,
    // which wouldn't match a URL slug's stripped name.
    county: { layerId: 1, nameField: "COUNTY" },
    municipalities: [
      {
        // NJ has no unincorporated land and no separate city/town/village
        // layers -- one flat layer covering all ~564 municipalities across
        // 5 statutory forms, confirmed live via a distinct-values query.
        layerId: 2,
        nameField: "NAME",
        countyField: "COUNTY",
        populationFields: ["POP2020", "POP2010", "POP2000", "POP1990", "POP1980"],
        type: {
          field: "MUN_TYPE",
          valueMap: {
            City: "city",
            Town: "town",
            Village: "village",
            Borough: "borough",
            Township: "township",
          },
        },
      },
    ],
  },
  parcels: {
    queryUrl: "https://maps.nj.gov/arcgis/rest/services/Framework/Cadastral/MapServer/0/query",
    // Explicit allowlist -- OWNER_NAME/ST_ADDRESS/CITY_STATE/ZIP_CODE*
    // (owner mailing address), LAND_VAL/IMPRVT_VAL/NET_VALUE/LAST_YR_TX/
    // SALE_PRICE, and DEED_BOOK/PAGE/DATE are all confirmed-live flat
    // fields on this same layer but deliberately never named here -- see
    // parcels.ts's field-mapping code for why that's the guarantee they
    // never reach our DB or a client.
    fields: {
      externalId: "PAMS_PIN",
      county: "COUNTY",
      municipality: "MUN_NAME",
      address: "PROP_LOC",
      propertyClass: "PROP_CLASS",
      acres: "CALC_ACRE",
      // No int roll-year field -- PCL_LASTUPD is a last-update date, used
      // to derive a vintage year instead (see parcels.ts's cacheParcel).
      vintageDateField: "PCL_LASTUPD",
    },
    // No classAllowlist/classDescriptions yet -- MOD-IV classes (Table 2 of
    // local/state-expansion.md) are deferred, so "Show Owner" stays
    // unavailable for NJ parcels until that's built.
  },
};
