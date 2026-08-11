import type { StateConfig } from "./types";

// Bounding-box-only stub -- no civilBoundaries or parcels service confirmed
// yet. Add those once a real, verified statewide GIS service is found (see
// ny.ts for the shape once one is).
export const ME_STATE_CONFIG: StateConfig = {
  code: "me",
  name: "Maine",
  boundingBox: { minLat: 42.9, maxLat: 47.5, minLng: -71.1, maxLng: -66.9 },
};
