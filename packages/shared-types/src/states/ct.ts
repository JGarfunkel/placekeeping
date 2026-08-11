import type { StateConfig } from "./types";

// Bounding-box-only stub -- no civilBoundaries or parcels service confirmed
// yet. Add those once a real, verified statewide GIS service is found (see
// ny.ts for the shape once one is).
export const CT_STATE_CONFIG: StateConfig = {
  code: "ct",
  name: "Connecticut",
  boundingBox: { minLat: 40.9, maxLat: 42.1, minLng: -73.8, maxLng: -71.7 },
};
