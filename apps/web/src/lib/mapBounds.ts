export type MapBounds = {
  north: number;
  south: number;
  east: number;
  west: number;
};

// Handles a view that crosses the antimeridian (west > east).
export function inBounds(bounds: MapBounds, lat: number, lng: number): boolean {
  if (lat < bounds.south || lat > bounds.north) return false;
  return bounds.west <= bounds.east
    ? lng >= bounds.west && lng <= bounds.east
    : lng >= bounds.west || lng <= bounds.east;
}
