export type SpotFunction = "cultivated" | "edge" | "built" | "wild";
export type Focus = "trees" | "shrubs" | "grasses" | "forbs" | "ferns" | "none";
// Same four stored values weed_level has always had -- Overgrowth is a
// display relabel, not a new value set. See local/reclassification-migration.md.
export type Overgrowth = "minimal" | "light" | "thick" | "overtaken";
export type PinFill = "solid" | "outline";

// Fixed body color for every pin, regardless of Function/Focus -- unlike the
// old scheme, category is no longer carried by color at all (Function moved
// to shape, see resolveSpotPin.ts). Kept as the same green the old "wild
// area" pins used, since that legibility work (basemap contrast, deuteranopia
// check -- see public/pins/README.md's Colors section) already applies to it.
export const PIN_BODY_COLOR = { fill: "#2f6b4f", stroke: "#234f3b" } as const;

// The two accent hues layered on top of the body: Overgrowth's ring and
// Bloom's pink. Deliberately distinct from each other and from the existing
// gold basemap-contrast trim (see renderPin.ts), so a pin carrying both
// signals at once doesn't read as one blob of color.
export const OVERGROWTH_RING_COLOR = "#c8781f";
export const BLOOM_COLOR = "#b5296b";

// Month numbers, 1-12, the spot is known to bloom in -- same shape as
// spots.bloomMonths in @placekeeping/shared-types. Kept as a plain type here
// (not importing the shared-types type) to match this module's existing
// convention of defining its own small local types rather than depending on
// the DB-facing package -- see the Purpose/Vegetation/WeedLevel types this
// replaces.
export type BloomMonths = readonly number[];

export interface BloomSpec {
  months: BloomMonths;
  // ceil(monthCount/2), 0-6 -- the six-petal forbs flower's fill count, and
  // the shrub/tree perimeter marks' count. Duplicated here rather than
  // recomputed in renderPin so resolvePin stays the one place that reads the
  // raw month array. See local/reclassification-plan.md's Bloom section.
  petalCount: number;
}

export function bloomSpecFromMonths(months: BloomMonths): BloomSpec | null {
  if (months.length === 0) return null;
  return { months, petalCount: Math.ceil(months.length / 2) };
}

// Which glyph symbol (see glyph-sprite.svg) each Focus renders. `none` has no
// glyph at all -- Function no longer supplies a fallback icon the way
// `purpose` (garden/monument/island) used to, since Function moved to shape.
// trees/grasses/forbs reuse existing artwork under their old vegetation-keyed
// ids; ferns/shrubs are new (see local/reclassification-plan.md's Glyph status).
export const FOCUS_GLYPH_ID: Record<Focus, string | null> = {
  trees: "woodland",
  shrubs: "shrubs",
  grasses: "grassland",
  forbs: "pollinator",
  ferns: "ferns",
  none: null,
};

export interface PinSpec {
  shape: SpotFunction;
  glyph: string | null;
  fill: PinFill;
  ring: Overgrowth;
  bloom: BloomSpec | null;
  ink: string;
}

export function resolvePin(spot: {
  spotFunction: SpotFunction;
  focus: Focus;
  overgrowth: Overgrowth;
  stewardId: string | null;
  stewardIsOwner: boolean;
  bloom?: BloomSpec | null;
}): PinSpec {
  const fill: PinFill = spot.stewardId || spot.stewardIsOwner ? "solid" : "outline";
  const ink = fill === "solid" ? "#ffffff" : PIN_BODY_COLOR.fill;

  return {
    shape: spot.spotFunction,
    glyph: FOCUS_GLYPH_ID[spot.focus],
    fill,
    ring: spot.overgrowth,
    bloom: spot.bloom ?? null,
    ink,
  };
}

// A wild spot with no focus has nothing to draw a glyph for -- same rule the
// old isSpot() applied to wild_area + vegetation none. See
// public/pins/README.md's isSpot() rule; callers fall back to a default
// marker in that case.
export function isSpot(s: { spotFunction: SpotFunction; focus: Focus }): boolean {
  return !(s.spotFunction === "wild" && s.focus === "none");
}
