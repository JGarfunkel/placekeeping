import type { StateConfig } from "./types";

// Bounding-box-only stub -- no civilBoundaries or parcels service confirmed
// yet. Add those once a real, verified statewide GIS service is found (see
// ny.ts for the shape once one is, or census.ts for a Census TIGERweb-backed
// civilBoundaries).
export const ND_STATE_CONFIG: StateConfig = {
  code: "nd",
  name: "North Dakota",
  boundingBox: { minLat: 45.9, maxLat: 49.1, minLng: -104.1, maxLng: -96.5 },
};
