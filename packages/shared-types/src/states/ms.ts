import type { StateConfig } from "./types";

// Bounding-box-only stub -- no civilBoundaries or parcels service confirmed
// yet. Add those once a real, verified statewide GIS service is found (see
// ny.ts for the shape once one is, or census.ts for a Census TIGERweb-backed
// civilBoundaries).
export const MS_STATE_CONFIG: StateConfig = {
  code: "ms",
  name: "Mississippi",
  boundingBox: { minLat: 30.1, maxLat: 35.0, minLng: -91.7, maxLng: -88.0 },
};
