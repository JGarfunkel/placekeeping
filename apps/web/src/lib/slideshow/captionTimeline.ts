import type { SlideshowOptions } from "./options";

export const CAPTION_ITEM_COUNT = 4;
export const ENTER_MS = 450;
export const STAGGER_MS = 250;
export const EXIT_LEAD_MS = 600;
export const EXIT_FADE_MS = 300;
export const MIN_VISIBLE_MS = 2000;

export interface CaptionTimeline {
  /** Effective delay after any reduction, in ms. */
  delayMs: number;
  /** When each caption item starts entering, ms after the slide appears. */
  itemEnterMs: number[];
  /** When the last item has finished entering. */
  fullyInMs: number;
  /** When captions start leaving. */
  exitStartMs: number;
}

function entranceSpanMs(seq: SlideshowOptions["seq"]): number {
  return ENTER_MS + (seq === "staggered" ? STAGGER_MS * (CAPTION_ITEM_COUNT - 1) : 0);
}

/**
 * Captions start leaving 600 ms before the photo changes
 * (exit=before-photo) or as it changes (with-photo).
 */
export function captionExitStartMs(
  durMs: number,
  exit: SlideshowOptions["exit"],
): number {
  return exit === "before-photo" ? durMs - EXIT_LEAD_MS : durMs;
}

/**
 * The requested delay, reduced so the captions stay readable: delay +
 * entrance time + MIN_VISIBLE_MS must fit before the exit starts. Never
 * negative -- on a very short slide the delay bottoms out at 0.
 */
export function effectiveCaptionDelayMs(
  options: Pick<SlideshowOptions, "dur" | "delay" | "seq" | "exit">,
): number {
  const durMs = options.dur * 1000;
  const room =
    captionExitStartMs(durMs, options.exit) - entranceSpanMs(options.seq) - MIN_VISIBLE_MS;
  return Math.max(0, Math.min(options.delay * 1000, room));
}

export function computeCaptionTimeline(
  options: Pick<SlideshowOptions, "dur" | "delay" | "seq" | "exit">,
): CaptionTimeline {
  const delayMs = effectiveCaptionDelayMs(options);
  const itemEnterMs = Array.from({ length: CAPTION_ITEM_COUNT }, (_, i) =>
    delayMs + (options.seq === "staggered" ? i * STAGGER_MS : 0),
  );
  return {
    delayMs,
    itemEnterMs,
    fullyInMs: delayMs + entranceSpanMs(options.seq),
    exitStartMs: captionExitStartMs(options.dur * 1000, options.exit),
  };
}
