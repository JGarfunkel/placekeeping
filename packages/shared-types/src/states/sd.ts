import type { StateConfig } from "./types";

// Bounding-box-only stub -- no civilBoundaries or parcels service confirmed
// yet. Add those once a real, verified statewide GIS service is found (see
// ny.ts for the shape once one is, or census.ts for a Census TIGERweb-backed
// civilBoundaries).
export const SD_STATE_CONFIG: StateConfig = {
  code: "sd",
  name: "South Dakota",
  boundingBox: { minLat: 42.4, maxLat: 46.0, minLng: -104.1, maxLng: -96.4 },
};
