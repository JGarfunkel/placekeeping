import type { StateConfig } from "./types";

// Bounding-box-only stub -- no civilBoundaries or parcels service confirmed
// yet. Add those once a real, verified statewide GIS service is found (see
// ny.ts for the shape once one is, or census.ts for a Census TIGERweb-backed
// civilBoundaries).
export const WI_STATE_CONFIG: StateConfig = {
  code: "wi",
  name: "Wisconsin",
  boundingBox: { minLat: 42.4, maxLat: 47.1, minLng: -92.9, maxLng: -86.7 },
};
