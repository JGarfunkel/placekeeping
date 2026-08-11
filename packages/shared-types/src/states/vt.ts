import type { StateConfig } from "./types";

// Bounding-box-only stub -- no civilBoundaries or parcels service confirmed
// yet. Add those once a real, verified statewide GIS service is found (see
// ny.ts for the shape once one is).
export const VT_STATE_CONFIG: StateConfig = {
  code: "vt",
  name: "Vermont",
  boundingBox: { minLat: 42.7, maxLat: 45.1, minLng: -73.5, maxLng: -71.4 },
};
