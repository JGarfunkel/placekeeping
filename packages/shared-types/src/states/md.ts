import type { StateConfig } from "./types";

// Bounding-box-only stub -- no civilBoundaries or parcels service confirmed
// yet. Add those once a real, verified statewide GIS service is found (see
// ny.ts for the shape once one is, or census.ts for a Census TIGERweb-backed
// civilBoundaries).
export const MD_STATE_CONFIG: StateConfig = {
  code: "md",
  name: "Maryland",
  boundingBox: { minLat: 37.9, maxLat: 39.8, minLng: -79.5, maxLng: -75.0 },
};
