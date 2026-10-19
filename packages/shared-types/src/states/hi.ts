import type { StateConfig } from "./types";

// Bounding-box-only stub -- no civilBoundaries or parcels service confirmed
// yet. Add those once a real, verified statewide GIS service is found (see
// ny.ts for the shape once one is, or census.ts for a Census TIGERweb-backed
// civilBoundaries).
export const HI_STATE_CONFIG: StateConfig = {
  code: "hi",
  name: "Hawaii",
  boundingBox: { minLat: 18.9, maxLat: 22.3, minLng: -160.3, maxLng: -154.8 },
};
