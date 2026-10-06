// Slideshow display options, mirrored in URL query params so a configured
// slideshow can be shared as a link. Every value is validated: anything
// unknown falls back to the default.

export const DURATIONS = [4, 6, 8, 12] as const;
export const ORDERS = ["newest", "oldest", "random", "spot"] as const;
export const FITS = ["contain", "cover"] as const;
export const CAPTION_DELAYS = [0, 1, 2, 3] as const;
export const ENTRANCES = ["slide-up", "slide-left", "slide-right", "fade"] as const;
export const SEQUENCES = ["together", "staggered"] as const;
export const POSITIONS = ["bottom", "left", "right"] as const;
export const EXITS = ["with-photo", "before-photo"] as const;

export interface SlideshowOptions {
  dur: (typeof DURATIONS)[number];
  order: (typeof ORDERS)[number];
  fit: (typeof FITS)[number];
  captions: boolean;
  delay: (typeof CAPTION_DELAYS)[number];
  enter: (typeof ENTRANCES)[number];
  seq: (typeof SEQUENCES)[number];
  pos: (typeof POSITIONS)[number];
  exit: (typeof EXITS)[number];
  // Not in the original option table: stop at the last slide instead of looping.
  loop: boolean;
}

export const DEFAULT_OPTIONS: SlideshowOptions = {
  dur: 8,
  order: "newest",
  fit: "contain",
  captions: true,
  delay: 2,
  enter: "slide-up",
  seq: "staggered",
  pos: "bottom",
  exit: "before-photo",
  loop: true,
};

type RawParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function pickString<T extends string>(
  raw: string | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  return allowed.find((v) => v === raw) ?? fallback;
}

function pickNumber<T extends number>(
  raw: string | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  if (raw === undefined || !/^\d+$/.test(raw)) return fallback;
  const n = Number(raw);
  return allowed.find((v) => v === n) ?? fallback;
}

export function parseSlideshowOptions(params: RawParams): SlideshowOptions {
  const d = DEFAULT_OPTIONS;
  const captions = first(params.captions);
  return {
    dur: pickNumber(first(params.dur), DURATIONS, d.dur),
    order: pickString(first(params.order), ORDERS, d.order),
    fit: pickString(first(params.fit), FITS, d.fit),
    captions: captions === "off" ? false : captions === "on" ? true : d.captions,
    delay: pickNumber(first(params.delay), CAPTION_DELAYS, d.delay),
    enter: pickString(first(params.enter), ENTRANCES, d.enter),
    seq: pickString(first(params.seq), SEQUENCES, d.seq),
    pos: pickString(first(params.pos), POSITIONS, d.pos),
    exit: pickString(first(params.exit), EXITS, d.exit),
    loop: first(params.loop) === "off" ? false : first(params.loop) === "on" ? true : d.loop,
  };
}

/** Only non-default values, so shared links stay short. */
export function serializeSlideshowOptions(options: SlideshowOptions): URLSearchParams {
  const params = new URLSearchParams();
  const d = DEFAULT_OPTIONS;
  if (options.dur !== d.dur) params.set("dur", String(options.dur));
  if (options.order !== d.order) params.set("order", options.order);
  if (options.fit !== d.fit) params.set("fit", options.fit);
  if (options.captions !== d.captions) params.set("captions", options.captions ? "on" : "off");
  if (options.delay !== d.delay) params.set("delay", String(options.delay));
  if (options.enter !== d.enter) params.set("enter", options.enter);
  if (options.seq !== d.seq) params.set("seq", options.seq);
  if (options.pos !== d.pos) params.set("pos", options.pos);
  if (options.exit !== d.exit) params.set("exit", options.exit);
  if (options.loop !== d.loop) params.set("loop", options.loop ? "on" : "off");
  return params;
}
