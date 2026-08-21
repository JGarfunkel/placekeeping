// A site's map view should never zoom out further than this, no matter how
// sprawling its linked parcel geometry looks (e.g. a parcel whose boundary
// hugs a curving road -- see computeShapeFlag in packages/core/src/parcels.ts).
// 1 mile square is generous enough to still fit something genuinely large,
// like the NY Botanical Garden, in one frame -- so this is a sane cap for
// any site's overview map, not just a workaround for odd geometry.
const METERS_PER_MILE = 1609.34;
export const MAX_SITE_EXTENT_METERS = METERS_PER_MILE;

export interface LatLngBoundsBox {
  south: number;
  north: number;
  west: number;
  east: number;
}

// Shrinks `bounds` toward its own center so neither dimension exceeds
// maxMeters -- never expands it. A small site's natural bounds (fits in a
// backyard) passes through untouched; a sprawling one gets cropped to a
// maxMeters-wide box centered on where its content actually is (its parcels
// and spot pins), i.e. "near the pins" rather than an arbitrary corner.
export function clampBoundsToMaxExtent(
  bounds: LatLngBoundsBox,
  maxMeters: number = MAX_SITE_EXTENT_METERS,
): LatLngBoundsBox {
  const centerLat = (bounds.south + bounds.north) / 2;
  const centerLng = (bounds.west + bounds.east) / 2;
  const metersPerDegLat = 111320;
  const metersPerDegLng = 111320 * Math.cos((centerLat * Math.PI) / 180);
  const maxLatDelta = maxMeters / 2 / metersPerDegLat;
  const maxLngDelta = maxMeters / 2 / metersPerDegLng;
  return {
    south: Math.max(bounds.south, centerLat - maxLatDelta),
    north: Math.min(bounds.north, centerLat + maxLatDelta),
    west: Math.max(bounds.west, centerLng - maxLngDelta),
    east: Math.min(bounds.east, centerLng + maxLngDelta),
  };
}
