import type { StateConfig } from "./types";

// Bounding-box-only stub -- no civilBoundaries or parcels service confirmed
// yet. Add those once a real, verified statewide GIS service is found (see
// ny.ts for the shape once one is, or census.ts for a Census TIGERweb-backed
// civilBoundaries).
export const LA_STATE_CONFIG: StateConfig = {
  code: "la",
  name: "Louisiana",
  boundingBox: { minLat: 28.9, maxLat: 33.1, minLng: -94.1, maxLng: -88.8 },
};
