import type { StateConfig } from "./types";

// Bounding-box-only stub -- no civilBoundaries or parcels service confirmed
// yet. Add those once a real, verified statewide GIS service is found (see
// ny.ts for the shape once one is, or census.ts for a Census TIGERweb-backed
// civilBoundaries).
// Alaska's Aleutians cross the antimeridian; this box covers only the western
// hemisphere portion (east of -179.2), which holds nearly all of the state.

export const AK_STATE_CONFIG: StateConfig = {
  code: "ak",
  name: "Alaska",
  boundingBox: { minLat: 51.2, maxLat: 71.5, minLng: -179.2, maxLng: -129.9 },
};
