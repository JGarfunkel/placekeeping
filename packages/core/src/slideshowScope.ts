import { stripQualifier } from "./territory";

// What a /slideshow/<...segments> URL points at. Territory scopes reuse the
// /spots/ territory-slug shape (us/ny, us/ny/westchester-county,
// us/ny/new-castle-town); a single spot is spot/<id>.
export type SlideshowScope =
  | { kind: "state"; state: string; path: string }
  | { kind: "county"; state: string; countySlug: string; path: string }
  | { kind: "municipality"; state: string; muniSlug: string; path: string }
  | { kind: "spot"; spotId: number };

export function parseSlideshowScope(segments: string[]): SlideshowScope | null {
  const parts = segments.map((s) => s.toLowerCase());
  if (parts[0] === "spot") {
    if (parts.length !== 2 || !/^\d+$/.test(parts[1])) return null;
    const spotId = Number(parts[1]);
    return Number.isSafeInteger(spotId) ? { kind: "spot", spotId } : null;
  }

  if (parts[0] !== "us" || !/^[a-z]{2}$/.test(parts[1] ?? "")) return null;
  const state = parts[1];
  if (parts.length === 2) return { kind: "state", state, path: `us/${state}` };
  if (parts.length !== 3 || !/^[a-z0-9-]+$/.test(parts[2])) return null;

  const path = `us/${state}/${parts[2]}`;
  const { name, qualifier } = stripQualifier(parts[2]);
  if (!name) return null;
  if (qualifier === "county") {
    return { kind: "county", state, countySlug: name, path };
  }
  return { kind: "municipality", state, muniSlug: name, path };
}

/** The `scope` query value the API route takes: the segments joined as a path. */
export function slideshowScopeKey(scope: SlideshowScope): string {
  return scope.kind === "spot" ? `spot/${scope.spotId}` : scope.path;
}
