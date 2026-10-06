import { describe, expect, it } from "vitest";
import { computeCaptionTimeline, effectiveCaptionDelayMs } from "./captionTimeline";

describe("effectiveCaptionDelayMs", () => {
  it("keeps the requested delay when there is room", () => {
    expect(effectiveCaptionDelayMs({ dur: 8, delay: 2, seq: "staggered", exit: "before-photo" })).toBe(2000);
  });

  it("reduces the delay on short slides so captions stay up at least 2s", () => {
    // 4s slide, exit at 3400, staggered entrance spans 1200, min 2000 -> room 200.
    expect(effectiveCaptionDelayMs({ dur: 4, delay: 2, seq: "staggered", exit: "before-photo" })).toBe(200);
  });

  it("never goes negative", () => {
    expect(effectiveCaptionDelayMs({ dur: 4, delay: 3, seq: "staggered", exit: "before-photo" })).toBeGreaterThanOrEqual(0);
  });

  it("has more room with exit=with-photo and seq=together", () => {
    expect(effectiveCaptionDelayMs({ dur: 4, delay: 3, seq: "together", exit: "with-photo" })).toBe(1550);
  });
});

describe("computeCaptionTimeline", () => {
  it("staggers items 250ms apart after the delay", () => {
    const t = computeCaptionTimeline({ dur: 8, delay: 2, seq: "staggered", exit: "before-photo" });
    expect(t.itemEnterMs).toEqual([2000, 2250, 2500, 2750]);
    expect(t.fullyInMs).toBe(3200);
    expect(t.exitStartMs).toBe(7400);
  });

  it("enters all items together", () => {
    const t = computeCaptionTimeline({ dur: 8, delay: 1, seq: "together", exit: "with-photo" });
    expect(t.itemEnterMs).toEqual([1000, 1000, 1000, 1000]);
    expect(t.fullyInMs).toBe(1450);
    expect(t.exitStartMs).toBe(8000);
  });

  it("leaves captions visible at least 2s for every option combination", () => {
    for (const dur of [4, 6, 8, 12] as const) {
      for (const delay of [0, 1, 2, 3] as const) {
        for (const seq of ["together", "staggered"] as const) {
          for (const exit of ["with-photo", "before-photo"] as const) {
            const t = computeCaptionTimeline({ dur, delay, seq, exit });
            expect(t.exitStartMs - t.fullyInMs).toBeGreaterThanOrEqual(2000);
          }
        }
      }
    }
  });
});
