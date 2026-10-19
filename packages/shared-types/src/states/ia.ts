import type { StateConfig } from "./types";

// Bounding-box-only stub -- no civilBoundaries or parcels service confirmed
// yet. Add those once a real, verified statewide GIS service is found (see
// ny.ts for the shape once one is, or census.ts for a Census TIGERweb-backed
// civilBoundaries).
export const IA_STATE_CONFIG: StateConfig = {
  code: "ia",
  name: "Iowa",
  boundingBox: { minLat: 40.3, maxLat: 43.6, minLng: -96.7, maxLng: -90.1 },
};
