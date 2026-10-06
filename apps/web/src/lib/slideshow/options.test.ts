import { describe, expect, it } from "vitest";
import { DEFAULT_OPTIONS, parseSlideshowOptions, serializeSlideshowOptions } from "./options";

describe("parseSlideshowOptions", () => {
  it("returns defaults when no params are given", () => {
    expect(parseSlideshowOptions({})).toEqual(DEFAULT_OPTIONS);
  });

  it("accepts valid values", () => {
    expect(
      parseSlideshowOptions({
        dur: "12",
        order: "random",
        fit: "cover",
        captions: "off",
        delay: "0",
        enter: "fade",
        seq: "together",
        pos: "left",
        exit: "with-photo",
        loop: "off",
      }),
    ).toEqual({
      dur: 12,
      order: "random",
      fit: "cover",
      captions: false,
      delay: 0,
      enter: "fade",
      seq: "together",
      pos: "left",
      exit: "with-photo",
      loop: false,
    });
  });

  it("falls back to defaults for invalid values", () => {
    expect(
      parseSlideshowOptions({
        dur: "5",
        order: "shuffle",
        fit: "stretch",
        captions: "maybe",
        delay: "-1",
        enter: "spin",
        seq: "x",
        pos: "top",
        exit: "never",
        loop: "x",
      }),
    ).toEqual(DEFAULT_OPTIONS);
  });

  it("rejects non-integer numeric strings", () => {
    expect(parseSlideshowOptions({ dur: "8.0" }).dur).toBe(DEFAULT_OPTIONS.dur);
    expect(parseSlideshowOptions({ dur: "4abc" }).dur).toBe(DEFAULT_OPTIONS.dur);
  });

  it("takes the first of a repeated param", () => {
    expect(parseSlideshowOptions({ dur: ["6", "12"] }).dur).toBe(6);
  });
});

describe("serializeSlideshowOptions", () => {
  it("omits defaults and round-trips the rest", () => {
    expect(serializeSlideshowOptions(DEFAULT_OPTIONS).toString()).toBe("");
    const changed = { ...DEFAULT_OPTIONS, dur: 4 as const, captions: false, order: "spot" as const };
    const params = serializeSlideshowOptions(changed);
    expect(parseSlideshowOptions(Object.fromEntries(params))).toEqual(changed);
  });
});
