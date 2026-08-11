import type { StateConfig } from "./types";

// Bounding-box-only stub -- no civilBoundaries or parcels service confirmed
// yet. Add those once a real, verified statewide GIS service is found (see
// ny.ts for the shape once one is).
export const RI_STATE_CONFIG: StateConfig = {
  code: "ri",
  name: "Rhode Island",
  boundingBox: { minLat: 41.1, maxLat: 42.1, minLng: -72.0, maxLng: -71.0 },
};
