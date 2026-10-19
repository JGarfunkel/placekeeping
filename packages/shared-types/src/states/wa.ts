import { censusCivilBoundaries } from "./census";
import type { StateConfig } from "./types";

// Washington Department of Revenue two-digit land-use codes (LANDUSE_CD), per
// WAC 458-53-030: https://app.leg.wa.gov/WAC/default.aspx?cite=458-53-030
// Codes the rule marks "Not presently assigned" are omitted and fall back to
// their series label. The live layer also carries a few non-standard values
// (0, 9, 10, 20) that likewise fall back (or show the bare code).
const classDescriptions: Record<string, string> = {
  // 10s – Residential
  "11": "Household, single family units",
  "12": "Household, 2-4 units",
  "13": "Household, multiunits (5 or more)",
  "14": "Residential condominiums",
  "15": "Mobile home parks or courts",
  "16": "Hotels/motels",
  "17": "Institutional lodging",
  "18": "All other residential not elsewhere coded",
  "19": "Vacation and cabin",

  // 20s-30s – Manufacturing
  "21": "Food and kindred products",
  "22": "Textile mill products",
  "23": "Apparel and other finished products",
  "24": "Lumber and wood products (except furniture)",
  "25": "Furniture and fixtures",
  "26": "Paper and allied products",
  "27": "Printing and publishing",
  "28": "Chemicals",
  "29": "Petroleum refining and related industries",
  "30": "Rubber and miscellaneous plastic products",
  "31": "Leather and leather products",
  "32": "Stone, clay and glass products",
  "33": "Primary metal industries",
  "34": "Fabricated metal products",
  "35": "Scientific and controlling instruments; photographic and optical goods; watches and clocks",
  "39": "Miscellaneous manufacturing",

  // 40s – Transportation, communication and utilities
  "41": "Railroad/transit transportation",
  "42": "Motor vehicle transportation",
  "43": "Aircraft transportation",
  "44": "Marine craft transportation",
  "45": "Highway and street right of way",
  "46": "Automobile parking",
  "47": "Communication",
  "48": "Utilities",
  "49": "Other transportation, communication, and utilities",

  // 50s – Trade
  "50": "Condominiums (other than residential)",
  "51": "Wholesale trade",
  "52": "Retail – building materials, hardware, and farm equipment",
  "53": "Retail – general merchandise",
  "54": "Retail – food",
  "55": "Retail – automotive, marine craft, aircraft, and accessories",
  "56": "Retail – apparel and accessories",
  "57": "Retail – furniture, home furnishings and equipment",
  "58": "Retail – eating and drinking",
  "59": "Other retail trade",

  // 60s – Services
  "61": "Finance, insurance, and real estate services",
  "62": "Personal services",
  "63": "Business services",
  "64": "Repair services",
  "65": "Professional services",
  "66": "Contract construction services",
  "67": "Governmental services",
  "68": "Educational services",
  "69": "Miscellaneous services",

  // 70s – Cultural, entertainment and recreational
  "71": "Cultural activities and nature exhibitions",
  "72": "Public assembly",
  "73": "Amusements",
  "74": "Recreational activities",
  "75": "Resorts and group camps",
  "76": "Parks",
  "79": "Other cultural, entertainment, and recreational",

  // 80s – Resource production and extraction
  "81": "Agriculture (not classified under current use law)",
  "82": "Agriculture related activities",
  "83": "Agriculture classified under current use (ch. 84.34 RCW)",
  "84": "Fishing activities and related services",
  "85": "Mining activities and related services",
  "86": "Cannabis grow operations",
  "88": "Designated forest land (ch. 84.33 RCW)",
  "89": "Other resource production",

  // 90s – Undeveloped land and water areas
  "91": "Undeveloped land",
  "92": "Noncommercial forest",
  "93": "Water areas",
  "94": "Open space land (ch. 84.34 RCW)",
  "95": "Timberland (ch. 84.34 RCW)",
  "99": "Other undeveloped land",
};

// Fallback labels keyed by the code's first digit (what describePropertyClass
// looks up) -- one per tens-series of the codes above.
const classSeriesLabels: Record<string, string> = {
  "1": "Residential",
  "2": "Manufacturing",
  "3": "Manufacturing",
  "4": "Transportation, communication and utilities",
  "5": "Trade",
  "6": "Services",
  "7": "Cultural, entertainment and recreational",
  "8": "Resource production and extraction",
  "9": "Undeveloped land and water areas",
};

// Verified live 2026-10. Civil boundaries come from Census TIGERweb (see
// census.ts); parcels from WaTech's statewide Washington State Parcels
// Project layer.
export const WA_STATE_CONFIG: StateConfig = {
  code: "wa",
  name: "Washington",
  boundingBox: { minLat: 45.5, maxLat: 49.1, minLng: -124.9, maxLng: -116.9 },
  // WA has no civil townships -- cities and towns only (plus counties).
  civilBoundaries: censusCivilBoundaries("53"),
  parcels: {
    queryUrl:
      "https://services.arcgis.com/jsIt88o09Q0r1j8h/ArcGIS/rest/services/Current_Parcels/FeatureServer/0/query",
    // The public layer is published without owner/taxpayer fields; the
    // allowlist also never names VALUE_LAND/VALUE_BLDG (assessment) or
    // DATA_LINK (the county assessor's per-parcel page, which exposes owner).
    fields: {
      externalId: "PARCEL_ID_NR", // statewide-unique: "<county FIPS>-<county parcel no.>"
      printKey: "ORIG_PARCEL_ID", // the county's own parcel number
      address: "SITUS_ADDRESS",
      propertyClass: "LANDUSE_CD", // Dept. of Revenue land-use code (int)
      // No county/municipality: COUNTY_NM is a coded domain (stored as a
      // number like "1", not "Adams") and there's no municipality field.
      // Locality comes from the civil-boundary point lookup instead.
      // No acres field (only Shape__Area in sq ft) and no vintage-year
      // field, so vintage falls back to the current year.
    },
    classDescriptions,
    classSeriesLabels,
    // Deliberately no classAllowlist: "Show Owner" stays unavailable for WA.
    // The public layer has no owner fields at all, and fetchParcelOwner
    // (parcels.ts) is hardcoded to NY's PRIMARY_OWNER/ADD_OWNER names.
  },
};
