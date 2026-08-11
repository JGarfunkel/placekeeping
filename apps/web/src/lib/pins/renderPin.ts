import { PIN_COLORS, type PinSpec } from "./resolvePin";

export const PIN_PATH =
  "M12 1C6.2 1 1.5 5.7 1.5 11.5 1.5 19 12 33 12 33s10.5-14 10.5-21.5C22.5 5.7 17.8 1 12 1z";

// Gold "trim" ring drawn just outside the body's own stroke, like piping on
// a uniform -- it's what keeps a green pin legible over green foliage
// regardless of basemap. Original canvas (0 0 24 34) left only ~1-1.5 units
// of margin around the path, not enough for a wide stroke to sit outside it
// without clipping against the viewBox edge, so the canvas grew by 2 units
// on every side. Path/glyph/dot coordinates are untouched -- they're already
// well inside the new margin, only the <svg> wrapper and PIN_ANCHOR moved.
const TRIM_COLOR = "#e8b64a";
const TRIM_WIDTH = 1;

// herbaceous_weeds is the one non-square glyph: a 15x22 box so the stem
// reaches into the wedge. Everything else is square and centred in the head.
const GLYPH_BOX: Record<string, { w: number; h: number; trim: number; dx?: number; dy?: number }> = {
  garden:            { w: 15, h: 15, trim: 1.00 },
  monument:          { w: 30, h: 30, trim: 1.35 },  // source art has ~48% internal padding
  vegetable_herb:    { w: 15, h: 15, trim: 0.92 },
  ornamental:        { w: 15, h: 15, trim: 0.95 },
  pollinator:        { w: 30, h: 30, trim: 2.00, dx: 6, dy: 2 },  // source art is mostly thin negative space; needs much more trim than its bounding box suggests, and its own centring reads off-centre left without a nudge right
  wetland:           { w: 15, h: 15, trim: 0.88 },
  woodland:          { w: 15, h: 15, trim: 1.00 },
  grassland:         { w: 15, h: 15, trim: 1.00 },
  mowed_lawn:        { w: 15, h: 15, trim: 1.00 },
  herbaceous_weeds:  { w: 15, h: 22, trim: 1.00 },   // tall
  vigorous_weeds:    { w: 15, h: 15, trim: 1.00 },
};

// x=8/y=7 is an eyeballed centre for most glyphs, not the path's own
// geometric centre (which is x=12) -- moving it to match the path made
// everything except monument look worse, so it stays tuned-by-eye. Monument
// alone centres on x=12: it's the one glyph whose source art has enough
// internal padding (see GLYPH_BOX) that geometric centring reads correctly.
function glyphTransform(id: string): string {
  const box = GLYPH_BOX[id];
  if (id === "herbaceous_weeds") {
    const s = 19 / 22;                       // fill most of the pin height
    return `translate(${4 - 15 * s / 2} ${7.2 - 4.55 * s}) scale(${s})`;
  }
  const s = (11 * box.trim) / box.w;
  const [cx, cy] = id === "monument" ? [12, 8] : [7, 6];
  return `translate(${cx + (box.dx ?? 0) - box.w * s / 2} ${cy + (box.dy ?? 0) - box.h * s / 2}) scale(${s})`;
}

const DOT = { cx: 12, cy: 22.3 };

// `light` and `thick` carry near-identical ink and separate by shape (ring
// vs disc), which is what survives at small size. `overtaken` carries
// roughly 75% more ink, so it reads as an escalation rather than a fourth
// similar mark.
//
// The dot is always this fixed orange, not the pin's own ink -- weed level
// is a severity signal independent of the pin's glyph color, and a solid
// orange pin (weedy + stewarded) would otherwise swallow an orange-on-orange
// mark. The white halo drawn behind it is what keeps it legible there too.
const DOT_COLOR = PIN_COLORS.orange.fill;
const DOT_HALO_COLOR = "#ffffff";

function renderDot(level: PinSpec["dot"]): string {
  const halo = (r: number) =>
    `<circle cx="${DOT.cx}" cy="${DOT.cy}" r="${r}" fill="${DOT_HALO_COLOR}"/>`;
  switch (level) {
    case "light":
      return halo(3.45)
           + `<circle cx="${DOT.cx}" cy="${DOT.cy}" r="2.7" fill="none" stroke="${DOT_COLOR}" stroke-width="1.5"/>`;
    case "thick":
      return halo(3.3)
           + `<circle cx="${DOT.cx}" cy="${DOT.cy}" r="2.8" fill="${DOT_COLOR}"/>`;
    case "overtaken":
      return halo(4.9)
           + `<circle cx="${DOT.cx}" cy="${DOT.cy}" r="4.3" fill="none" stroke="${DOT_COLOR}" stroke-width="1.1"/>`
           + `<circle cx="${DOT.cx}" cy="${DOT.cy}" r="2.5" fill="${DOT_COLOR}"/>`;
    default:
      return "";
  }
}

export function renderPin(spec: PinSpec): string {
  const { fill: f, stroke } = PIN_COLORS[spec.color];
  const solid = spec.fill === "solid";
  const bodyStrokeWidth = solid ? 0.8 : 1.7;

  // Drawn first, wider than the body's own stroke on the same path: the
  // body painted on top covers the inner half, leaving only the outer band
  // visible as a ring around it.
  const trim =
    `<path d="${PIN_PATH}" fill="none" stroke="${TRIM_COLOR}" ` +
    `stroke-width="${bodyStrokeWidth + 2 * TRIM_WIDTH}" stroke-linejoin="round"/>`;

  const body = solid
    ? `<path d="${PIN_PATH}" fill="${f}" stroke="${stroke}" stroke-width="0.8"/>`
    : `<path d="${PIN_PATH}" fill="#fff" stroke="${f}" stroke-width="1.7"/>`;

  const glyph =
    `<g transform="${glyphTransform(spec.glyph)}" color="${spec.ink}">` +
    `<use href="/pins/glyph-sprite.svg#g-${spec.glyph}"/></g>`;

  const dot = renderDot(spec.dot);

  return `<svg viewBox="-2 -2 28 38" width="28" height="38">${trim}${body}${glyph}${dot}</svg>`;
}

// Map anchor: the tip, not the centre. Shifted with the viewBox origin --
// still the same point on the path (12, 33), just relative to (-2, -2) now.
export const PIN_ANCHOR = { x: 14, y: 35 };

// Fallback marker for when there's no glyph to draw -- e.g. a wild_area spot
// with no vegetation set, or a scoreboard category that spans many
// vegetations at once. Same teardrop outline as every other pin, dressed in
// neutral gray rather than any of the PIN_COLORS (it isn't asserting a
// color/fill meaning, just standing in for "no icon here").
export const DEFAULT_PIN_SVG =
  `<svg viewBox="-2 -2 28 38" width="28" height="38">` +
  `<path d="${PIN_PATH}" fill="none" stroke="#e8b64a" stroke-width="2.8" stroke-linejoin="round"/>` +
  `<path d="${PIN_PATH}" fill="#374151" stroke="#1f2937" stroke-width="0.8"/>` +
  `</svg>`;
