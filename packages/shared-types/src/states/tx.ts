import type { StateConfig } from "./types";

// Bounding-box-only stub -- no civilBoundaries or parcels service confirmed
// yet. Add those once a real, verified statewide GIS service is found (see
// ny.ts for the shape once one is, or census.ts for a Census TIGERweb-backed
// civilBoundaries).
export const TX_STATE_CONFIG: StateConfig = {
  code: "tx",
  name: "Texas",
  boundingBox: { minLat: 25.8, maxLat: 36.6, minLng: -106.7, maxLng: -93.5 },
};
