import type { StateConfig } from "./types";

// Bounding-box-only stub -- no civilBoundaries or parcels service confirmed
// yet. Add those once a real, verified statewide GIS service is found (see
// ny.ts for the shape once one is, or census.ts for a Census TIGERweb-backed
// civilBoundaries).
export const NV_STATE_CONFIG: StateConfig = {
  code: "nv",
  name: "Nevada",
  boundingBox: { minLat: 35.0, maxLat: 42.1, minLng: -120.1, maxLng: -114.0 },
};
