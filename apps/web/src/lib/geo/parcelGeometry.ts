// GeoJSON MultiPolygon -> Google Maps Polygon `paths`. GeoJSON coordinates
// are [lng, lat] and a MultiPolygon is Polygon[], each Polygon is Ring[],
// each Ring is Position[] -- so one GeoJSON MultiPolygon can require
// several <Polygon> elements (one per disjoint piece), each carrying its
// own rings (first ring outer, any further rings are holes).
export function multiPolygonToPolygonPaths(geometry: {
  type: "MultiPolygon";
  coordinates: number[][][][];
}): google.maps.LatLngLiteral[][][] {
  return geometry.coordinates.map((rings) =>
    rings.map((ring) => ring.map(([lng, lat]) => ({ lat, lng }))),
  );
}
