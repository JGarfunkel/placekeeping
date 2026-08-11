import type { StateConfig } from "./types";

// Verified live 2026-08 (WebFetch against the actual MassGIS services,
// including a live sample parcel query to confirm LOT_SIZE is in acres,
// e.g. 0.2596, not square feet).
export const MA_STATE_CONFIG: StateConfig = {
  code: "ma",
  name: "Massachusetts",
  boundingBox: { minLat: 41.2, maxLat: 42.9, minLng: -73.6, maxLng: -69.9 },
  civilBoundaries: {
    url: "https://services1.arcgis.com/hGdibHYSPO59RG1h/arcgis/rest/services/Massachusetts_Municipalities/FeatureServer",
    // Counties still have real, mapped geographic shapes -- MA county
    // *government* was largely abolished, but the boundaries themselves
    // are published as their own MassGIS service (same ArcGIS Online org
    // as the municipalities/parcels services above, but a separate root),
    // confirmed live: 14 counties, plain names (e.g. "SUFFOLK", no
    // "County" suffix) matching the municipalities layer's own COUNTY field.
    county: {
      url: "https://services1.arcgis.com/hGdibHYSPO59RG1h/arcgis/rest/services/Massachusetts_Counties/FeatureServer",
      layerId: 1,
      nameField: "COUNTY",
    },
    municipalities: [
      {
        // Single flat "Areas" layer covering all 351 municipalities, type
        // as an attribute -- confirmed live distinct values: C=city,
        // T=town, TC=town with city government (mapped to city, the
        // functional match).
        layerId: 1,
        nameField: "TOWN",
        countyField: "COUNTY",
        populationFields: [
          "POP2020",
          "POP2010",
          "POP2000",
          "POP1990",
          "POP1980",
          "POP1970",
          "POP1960",
        ],
        type: { field: "TYPE", valueMap: { C: "city", T: "town", TC: "city" } },
      },
    ],
  },
  parcels: {
    queryUrl:
      "https://services1.arcgis.com/hGdibHYSPO59RG1h/arcgis/rest/services/Massachusetts_Property_Tax_Parcels/FeatureServer/0/query",
    // Explicit allowlist -- OWNER1/OWN_ADDR/OWN_CITY/OWN_STATE/OWN_ZIP/
    // OWN_CO (owner), and BLDG_VAL/LAND_VAL/OTHER_VAL/TOTAL_VAL/LS_DATE/
    // LS_PRICE/LS_BOOK/LS_PAGE (assessment/sale) are all confirmed-live
    // flat fields on this layer but deliberately never named here -- see
    // parcels.ts's field-mapping code for why that's the guarantee they
    // never reach our DB or a client.
    fields: {
      externalId: "LOC_ID", // MassGIS's stable coordinate-derived parcel key
      printKey: "MAP_PAR_ID", // human map/parcel id, e.g. "12_23"
      address: "SITE_ADDR",
      propertyClass: "USE_CODE",
      acres: "LOT_SIZE",
      vintageYearField: "FY", // fiscal year -- a direct roll-year equivalent
      // No municipality/county field on this layer -- only a numeric
      // TOWN_ID, no name. Locality gets filled from the civil-boundary
      // point lookup instead, same as any other state.
    },
    // No classAllowlist/classDescriptions yet -- DOR USE_CODE ranges (Table
    // 2 of local/state-expansion.md) are deferred, so "Show Owner" stays
    // unavailable for MA parcels until that's built.
  },
};
