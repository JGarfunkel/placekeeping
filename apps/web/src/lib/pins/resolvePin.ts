export type Purpose    = "garden" | "monument" | "wild_area";
export type Vegetation =
  | "vegetable_herb" | "ornamental" | "pollinator"
  | "wetland" | "woodland" | "grassland" | "mowed_lawn"
  | "herbaceous_weeds" | "vigorous_weeds" | "none";
export type WeedLevel  = "minimal" | "light" | "thick" | "overtaken";
export type PinColor   = "green" | "orange" | "navy";
export type PinFill    = "solid" | "outline";

const WEED_VEGETATION = new Set<Vegetation>(["herbaceous_weeds", "vigorous_weeds"]);

export const PIN_COLORS = {
  green:  { fill: "#2f6b4f", stroke: "#234f3b" },
  orange: { fill: "#b03a0f", stroke: "#8a2d09" },
  navy:   { fill: "#1f3a5f", stroke: "#16293f" },
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
  const glyph =
    spot.purpose === "monument" ? "monument" :
    spot.vegetation !== "none"  ? spot.vegetation :
    spot.purpose === "garden"   ? "garden" :
                                   spot.vegetation;

  const color: PinColor =
    spot.purpose === "monument" ? "navy"   :
    WEED_VEGETATION.has(spot.vegetation) ? "orange" :
                                       "green";

  const fill: PinFill = spot.stewardId ? "solid" : "outline";

  // No weed-glyph suppression. The glyph says WHICH weed; the dot says HOW
  // MUCH. An orange bramble pin with a light ring means brambles coming in
  // at the edge. The same pin with the overtaken mark means a wall of it.
  const dot: WeedLevel | null =
    spot.weedLevel === "minimal" ? null : spot.weedLevel;

  const ink = fill === "solid" ? "#ffffff" : PIN_COLORS[color].fill;
  return { glyph, color, fill, dot, ink };
}

export function isSpot(s: { purpose: Purpose; vegetation: Vegetation }): boolean {
  return !(s.purpose === "wild_area" && s.vegetation === "none");
}
