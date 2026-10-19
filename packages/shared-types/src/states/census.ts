import type { CivilBoundariesConfig, MunicipalityLayerConfig } from "./types";

// Civil boundaries for states with no state-hosted municipal GIS service
// we've verified, built from Census TIGERweb instead. TIGERweb layers are
// nationwide, so every layer is scoped to one state via `where` (see
// MunicipalityLayerConfig.where). Verified live 2026-10 against IL/MO/OR/WA.
//
// Tradeoffs vs. a state-hosted service (NY/NJ/MA): places and county
// subdivisions carry no county name and no population, so cross-county
// same-name ties fall back to the ambiguous-options path rather than being
// broken by population. Names use BASENAME ("Seattle"), not NAME ("Seattle
// city"), so lookups match the plain slug.
const TIGERWEB = "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb";

// Incorporated-place LSADC codes -> our municipality types.
const PLACE_TYPES: Record<string, "city" | "town" | "village"> = {
  "25": "city",
  "43": "town",
  "47": "village",
};

export function censusCivilBoundaries(
  stateFips: string,
  options: { townships?: boolean } = {},
): CivilBoundariesConfig {
  const municipalities: MunicipalityLayerConfig[] = [
    {
      // Incorporated Places: one flat layer, type via LSADC.
      layerId: 4,
      nameField: "BASENAME",
      idField: "GEOID",
      where: `STATE='${stateFips}'`,
      type: { field: "LSADC", valueMap: PLACE_TYPES },
    },
  ];
  if (options.townships) {
    municipalities.push({
      // County Subdivisions also hold CCDs/precincts/wards, which are not
      // municipalities -- LSADC 44 keeps only true civil townships.
      layerId: 1,
      nameField: "BASENAME",
      idField: "GEOID",
      where: `STATE='${stateFips}' AND LSADC='44'`,
      type: "township",
    });
  }
  return {
    url: `${TIGERWEB}/Places_CouSub_ConCity_SubMCD/MapServer`,
    county: {
      url: `${TIGERWEB}/State_County/MapServer`,
      layerId: 1,
      nameField: "BASENAME",
      idField: "GEOID",
      where: `STATE='${stateFips}'`,
    },
    municipalities,
  };
}
