import type { StateConfig } from "./types";

// Bounding-box-only stub -- no civilBoundaries or parcels service confirmed
// yet. Add those once a real, verified statewide GIS service is found (see
// ny.ts for the shape once one is, or census.ts for a Census TIGERweb-backed
// civilBoundaries).
export const SC_STATE_CONFIG: StateConfig = {
  code: "sc",
  name: "South Carolina",
  boundingBox: { minLat: 32.0, maxLat: 35.3, minLng: -83.4, maxLng: -78.5 },
};
