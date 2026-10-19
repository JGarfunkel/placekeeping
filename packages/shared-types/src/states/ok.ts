import type { StateConfig } from "./types";

// Bounding-box-only stub -- no civilBoundaries or parcels service confirmed
// yet. Add those once a real, verified statewide GIS service is found (see
// ny.ts for the shape once one is, or census.ts for a Census TIGERweb-backed
// civilBoundaries).
export const OK_STATE_CONFIG: StateConfig = {
  code: "ok",
  name: "Oklahoma",
  boundingBox: { minLat: 33.6, maxLat: 37.1, minLng: -103.1, maxLng: -94.4 },
};
