import { describe, expect, it } from "vitest";
import { classifySpotPath } from "./spotRoute";

describe("classifySpotPath", () => {
  it("classifies a numeric id as spotId", () => {
    expect(classifySpotPath(["123"])).toEqual({ kind: "spotId", id: 123 });
  });

  it("classifies id/edit as spotEdit", () => {
    expect(classifySpotPath(["123", "edit"])).toEqual({
      kind: "spotEdit",
      id: 123,
    });
  });

  it("classifies id/observations/new as newObservation", () => {
    expect(classifySpotPath(["123", "observations", "new"])).toEqual({
      kind: "newObservation",
      id: 123,
    });
  });

  it("rejects id/observations/<anything else>", () => {
    expect(classifySpotPath(["123", "observations", "edit"])).toEqual({
      kind: "notFound",
    });
  });

  it("rejects id/<unknown action>", () => {
    expect(classifySpotPath(["123", "delete"])).toEqual({ kind: "notFound" });
  });

  it("rejects a 4-segment numeric-id path", () => {
    expect(
      classifySpotPath(["123", "observations", "new", "extra"]),
    ).toEqual({ kind: "notFound" });
  });

  it("classifies a 2-letter code as a country view", () => {
    expect(classifySpotPath(["us"])).toEqual({ kind: "country", cc: "us" });
  });

  it("lowercases the country code", () => {
    expect(classifySpotPath(["US"])).toEqual({ kind: "country", cc: "us" });
  });

  it("classifies cc/sc as a state view", () => {
    expect(classifySpotPath(["us", "ny"])).toEqual({
      kind: "state",
      cc: "us",
      sc: "ny",
    });
  });

  it("classifies cc/sc/mc as a municipality view", () => {
    expect(classifySpotPath(["us", "ny", "ossining-town"])).toEqual({
      kind: "municipality",
      cc: "us",
      sc: "ny",
      mc: "ossining-town",
    });
  });

  it("classifies cc/sc/mc/slug as a spot slug", () => {
    expect(
      classifySpotPath(["us", "ny", "ossining-town", "the-lawn"]),
    ).toEqual({
      kind: "slug",
      cc: "us",
      sc: "ny",
      mc: "ossining-town",
      slug: "the-lawn",
    });
  });

  it("rejects a 5-segment territory/slug path", () => {
    expect(
      classifySpotPath(["us", "ny", "ossining-town", "the-lawn", "extra"]),
    ).toEqual({ kind: "notFound" });
  });

  it("rejects a first segment that is neither numeric nor a 2-letter code", () => {
    expect(classifySpotPath(["ossining-town"])).toEqual({ kind: "notFound" });
    expect(classifySpotPath(["usa"])).toEqual({ kind: "notFound" });
  });

  it("rejects an empty path", () => {
    expect(classifySpotPath([])).toEqual({ kind: "notFound" });
  });
});
