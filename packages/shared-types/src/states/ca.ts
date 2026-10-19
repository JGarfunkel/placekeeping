import type { StateConfig } from "./types";

// Bounding-box-only stub -- no civilBoundaries or parcels service confirmed
// yet. Add those once a real, verified statewide GIS service is found (see
// ny.ts for the shape once one is, or census.ts for a Census TIGERweb-backed
// civilBoundaries).
export const CA_STATE_CONFIG: StateConfig = {
  code: "ca",
  name: "California",
  boundingBox: { minLat: 32.5, maxLat: 42.1, minLng: -124.5, maxLng: -114.1 },
};
