import { describe, expect, it } from "vitest";
import { buildLocationLabel } from "./slideshow";
import { parseSlideshowScope, slideshowScopeKey } from "./slideshowScope";

describe("parseSlideshowScope", () => {
  it("parses a state", () => {
    expect(parseSlideshowScope(["us", "NY"])).toEqual({ kind: "state", state: "ny", path: "us/ny" });
  });

  it("parses a county by its -county suffix", () => {
    expect(parseSlideshowScope(["us", "ny", "westchester-county"])).toEqual({
      kind: "county",
      state: "ny",
      countySlug: "westchester",
      path: "us/ny/westchester-county",
    });
  });

  it("parses a municipality, stripping the type qualifier", () => {
    expect(parseSlideshowScope(["us", "ny", "new-castle-town"])).toMatchObject({
      kind: "municipality",
      muniSlug: "new-castle",
    });
    expect(parseSlideshowScope(["us", "ny", "chappaqua"])).toMatchObject({
      kind: "municipality",
      muniSlug: "chappaqua",
    });
  });

  it("parses a spot id", () => {
    expect(parseSlideshowScope(["spot", "42"])).toEqual({ kind: "spot", spotId: 42 });
  });

  it("rejects malformed scopes", () => {
    expect(parseSlideshowScope([])).toBeNull();
    expect(parseSlideshowScope(["spot", "abc"])).toBeNull();
    expect(parseSlideshowScope(["spot"])).toBeNull();
    expect(parseSlideshowScope(["fr", "ny"])).toBeNull();
    expect(parseSlideshowScope(["us", "new-york"])).toBeNull();
    expect(parseSlideshowScope(["us", "ny", "a", "b"])).toBeNull();
    expect(parseSlideshowScope(["us", "ny", "bad slug"])).toBeNull();
  });

  it("round-trips through slideshowScopeKey", () => {
    expect(slideshowScopeKey({ kind: "spot", spotId: 7 })).toBe("spot/7");
    expect(slideshowScopeKey({ kind: "state", state: "ny", path: "us/ny" })).toBe("us/ny");
  });
});

describe("buildLocationLabel", () => {
  it("joins spot name and municipality", () => {
    expect(buildLocationLabel("Gedney Park", "New Castle", null)).toBe("Gedney Park, New Castle");
  });
  it("falls back to postal city, then name alone", () => {
    expect(buildLocationLabel("Gedney Park", null, "Chappaqua")).toBe("Gedney Park, Chappaqua");
    expect(buildLocationLabel("Gedney Park", null, null)).toBe("Gedney Park");
  });
  it("does not repeat a place equal to the name", () => {
    expect(buildLocationLabel("Chappaqua", "Chappaqua", null)).toBe("Chappaqua");
  });
});
