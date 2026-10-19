import type { StateConfig } from "./types";

// Bounding-box-only stub -- no civilBoundaries or parcels service confirmed
// yet. Add those once a real, verified statewide GIS service is found (see
// ny.ts for the shape once one is, or census.ts for a Census TIGERweb-backed
// civilBoundaries).
export const MT_STATE_CONFIG: StateConfig = {
  code: "mt",
  name: "Montana",
  boundingBox: { minLat: 44.3, maxLat: 49.1, minLng: -116.1, maxLng: -104.0 },
};
