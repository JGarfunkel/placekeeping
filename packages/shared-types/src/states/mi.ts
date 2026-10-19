import type { StateConfig } from "./types";

// Bounding-box-only stub -- no civilBoundaries or parcels service confirmed
// yet. Add those once a real, verified statewide GIS service is found (see
// ny.ts for the shape once one is, or census.ts for a Census TIGERweb-backed
// civilBoundaries).
export const MI_STATE_CONFIG: StateConfig = {
  code: "mi",
  name: "Michigan",
  boundingBox: { minLat: 41.6, maxLat: 48.3, minLng: -90.5, maxLng: -82.1 },
};
