import type { StateConfig } from "./types";

// Bounding-box-only stub -- no civilBoundaries or parcels service confirmed
// yet. Add those once a real, verified statewide GIS service is found (see
// ny.ts for the shape once one is).
export const NH_STATE_CONFIG: StateConfig = {
  code: "nh",
  name: "New Hampshire",
  boundingBox: { minLat: 42.6, maxLat: 45.4, minLng: -72.6, maxLng: -70.6 },
};
