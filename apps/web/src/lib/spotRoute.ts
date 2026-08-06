// Classifies the segments under /spots/ into either the numeric id-tree
// (detail/edit/observations) or the territory/slug tree (cc/sc/mc/slug),
// distinguished by whether the first segment is numeric or a 2-letter code.
// See apps/web/user-stories.md ("Spot page - routing") for the spec.

import { debugLog } from "@placekeeping/core";

export type SpotRoute =
  | { kind: "spotId"; id: number }
  | { kind: "spotEdit"; id: number }
  | { kind: "newObservation"; id: number }
  | { kind: "country"; cc: string }
  | { kind: "state"; cc: string; sc: string }
  | { kind: "municipality"; cc: string; sc: string; mc: string }
  | { kind: "slug"; cc: string; sc: string; mc: string; slug: string }
  | { kind: "notFound" };

const NOT_FOUND: SpotRoute = { kind: "notFound" };

export function classifySpotPath(segments: string[]): SpotRoute {
  const route = classifySpotPathImpl(segments);
  debugLog("[spotRoute] classifySpotPath", segments, "->", route);
  return route;
}

function classifySpotPathImpl(segments: string[]): SpotRoute {
  const [a, b, c, d] = segments;
  if (a === undefined) return NOT_FOUND;

  if (/^\d+$/.test(a)) {
    const id = Number(a);
    if (!Number.isInteger(id)) return NOT_FOUND;
    if (segments.length === 1) return { kind: "spotId", id };
    if (segments.length === 2 && b === "edit") return { kind: "spotEdit", id };
    if (segments.length === 3 && b === "observations" && c === "new") {
      return { kind: "newObservation", id };
    }
    return NOT_FOUND;
  }

  if (/^[a-z]{2}$/i.test(a)) {
    const cc = a.toLowerCase();
    if (segments.length === 1) return { kind: "country", cc };
    if (segments.length === 2) return { kind: "state", cc, sc: b };
    if (segments.length === 3) return { kind: "municipality", cc, sc: b, mc: c };
    if (segments.length === 4) return { kind: "slug", cc, sc: b, mc: c, slug: d };
    return NOT_FOUND;
  }

  return NOT_FOUND;
}
