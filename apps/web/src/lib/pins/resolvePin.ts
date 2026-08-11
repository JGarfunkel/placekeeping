export type Purpose    = "garden" | "monument" | "wild_area";
export type Vegetation =
  | "vegetable_herb" | "ornamental" | "pollinator"
  | "wetland" | "woodland" | "grassland" | "mowed_lawn"
  | "herbaceous_weeds" | "vigorous_weeds" | "none";
export type WeedLevel  = "minimal" | "light" | "thick" | "overtaken";
export type PinColor   = "green" | "pink" | "grey";
export type PinFill    = "solid" | "outline";

export const PIN_COLORS = {
  green: { fill: "#2f6b4f", stroke: "#234f3b" },
  pink:  { fill: "#b5296b", stroke: "#8a1f52" },
  // Warm-stone, not neutral: a cool/blue-leaning grey collapses toward green
  // under deuteranopia (simulated deltaE ~8, matching the ΔE 4.8 that ruled
  // grey out here once before -- see public/pins/README.md). Shifting grey
  // warm moves it off that confusion line; this one holds at ~21.
  grey:  { fill: "#5c5347", stroke: "#443d34" },
} as const;

export interface PinSpec {
  glyph: string;
  color: PinColor;
  fill:  PinFill;
  dot:   WeedLevel | null;
  ink:   string;
}

export function resolvePin(spot: {
  purpose: Purpose; vegetation: Vegetation;
  weedLevel: WeedLevel; stewardId: string | null;
}): PinSpec {
  // Vegetation wins whenever there is any -- even on a monument, since what
  // is actually growing there is more informative than a fixed obelisk. The
  // monument/garden glyphs are fallbacks for when there's nothing to draw.
  const glyph =
    spot.vegetation !== "none"  ? spot.vegetation :
    spot.purpose === "monument" ? "monument" :
    spot.purpose === "garden"   ? "garden" :
                                   spot.vegetation;

  // Color encodes type, not condition: garden vs. monument vs. wild area.
  // Weediness is the dot's job (below), not the pin's color.
  const color: PinColor =
    spot.purpose === "monument" ? "grey" :
    spot.purpose === "garden"   ? "pink" :
                                   "green";

  const fill: PinFill = spot.stewardId ? "solid" : "outline";

  // No weed-glyph suppression. The glyph says WHICH weed; the dot says HOW
  // MUCH. A bramble pin with a light ring means brambles coming in at the
  // edge. The same pin with the overtaken mark means a wall of it.
  const dot: WeedLevel | null =
    spot.weedLevel === "minimal" ? null : spot.weedLevel;

  const ink = fill === "solid" ? "#ffffff" : PIN_COLORS[color].fill;
  return { glyph, color, fill, dot, ink };
}

export function isSpot(s: { purpose: Purpose; vegetation: Vegetation }): boolean {
  return !(s.purpose === "wild_area" && s.vegetation === "none");
}
