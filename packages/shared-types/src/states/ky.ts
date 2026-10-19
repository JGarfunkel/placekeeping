import type { StateConfig } from "./types";

// Bounding-box-only stub -- no civilBoundaries or parcels service confirmed
// yet. Add those once a real, verified statewide GIS service is found (see
// ny.ts for the shape once one is, or census.ts for a Census TIGERweb-backed
// civilBoundaries).
export const KY_STATE_CONFIG: StateConfig = {
  code: "ky",
  name: "Kentucky",
  boundingBox: { minLat: 36.4, maxLat: 39.2, minLng: -89.6, maxLng: -81.9 },
};
