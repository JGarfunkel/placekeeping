import {
  BLOOM_COLOR,
  FOCUS_GLYPH_ID,
  OVERGROWTH_RING_COLOR,
  PIN_BODY_COLOR,
  type BloomSpec,
  type Overgrowth,
  type PinSpec,
  type SpotFunction,
} from "./resolvePin";

// Four pin-head silhouettes, one per Function -- see local/reclassification-plan.md.
// All four share the same base circle (center 12,11.5, radius 10.5) and the
// same lower taper down to the tip (12,33), so they stay the same overall
// size/anchor and differ only in how the rim is drawn between the leftmost
// (1.5,11.5) and rightmost (22.5,11.5) points, over the top.
//
//   cultivated -- round: the full circular arc, unchanged from the original
//     single-shape pin.
//   edge -- flat top: the circle with a flat chord cut across the top (a
//     "clipped" circle) at y=4.
//   built -- square: a rounded square inscribed in the same footprint.
//   wild -- crown: five spikes around the top, alternating with six valleys
//     (the two rim points plus four more), all on the same base circle.
//
// Lower taper, shared by every shape (from a rim point (x,11.5) down to the
// tip and back): C<x> 19 12 33 12 33 -- reused verbatim below rather than
// computed at runtime, since it's the same two calls either side.
const TAPER_RIGHT = "C22.5 19 12 33 12 33";
const TAPER_LEFT = "C12 33 1.5 19 1.5 11.5";

export const PIN_PATHS: Record<SpotFunction, string> = {
  cultivated:
    "M1.5 11.5A10.5 10.5 0 0 1 22.5 11.5" + TAPER_RIGHT + TAPER_LEFT + "Z",
  edge:
    "M1.5 11.5A10.5 10.5 0 0 1 4.65 4L19.35 4A10.5 10.5 0 0 1 22.5 11.5" +
    TAPER_RIGHT +
    TAPER_LEFT +
    "Z",
  built:
    "M1.5 11.5L1.5 5Q1.5 2 4.5 2L19.5 2Q22.5 2 22.5 5L22.5 11.5" +
    TAPER_RIGHT +
    TAPER_LEFT +
    "Z",
  wild:
    "M1.5 11.5L0.11 7.64L3.51 5.33L4.65 1.39L8.75 1.51L12 -1L15.25 1.51L19.35 1.39L20.49 5.33L23.89 7.64L22.5 11.5" +
    TAPER_RIGHT +
    TAPER_LEFT +
    "Z",
};

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
// Retained even though `herbaceous_weeds` is no longer a Focus value of its
// own -- vegetation stays on spots/observations until
// local/reclassification-migration.md's Phase 4 drops it, and old rows can
// still resolve a pin through the pre-reclassification path during that
// window.
const GLYPH_BOX: Record<string, { w: number; h: number; trim: number; dx?: number; dy?: number }> = {
  garden:            { w: 15, h: 15, trim: 1.00 },
  monument:          { w: 30, h: 30, trim: 1.35 },  // source art has ~48% internal padding
  island:            { w: 15, h: 15, trim: 1.00 },
  vegetable_herb:    { w: 15, h: 15, trim: 0.92 },
  ornamental:        { w: 15, h: 15, trim: 0.95 },
  pollinator:        { w: 30, h: 30, trim: 2.00, dx: 6, dy: 2 },  // source art is mostly thin negative space; needs much more trim than its bounding box suggests, and its own centring reads off-centre left without a nudge right
  wetland:           { w: 15, h: 15, trim: 0.88 },
  woodland:          { w: 15, h: 15, trim: 1.00 },
  grassland:         { w: 15, h: 15, trim: 1.00 },
  mowed_lawn:        { w: 15, h: 15, trim: 1.00 },
  herbaceous_weeds:  { w: 15, h: 22, trim: 1.00 },   // tall
  vigorous_weeds:    { w: 15, h: 15, trim: 1.00 },
  ferns:             { w: 15, h: 15, trim: 1.00 },
  shrubs:            { w: 15, h: 15, trim: 1.00 },
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

// Overgrowth's ring, at the rim, thickening inward as the level advances --
// see local/reclassification-plan.md. Drawn as a stroke on the same path as
// the pin body (so it follows whichever Function shape is active), layered
// on top of body+trim and below the glyph. `minimal` draws nothing, matching
// the old dot's "no mark for the lowest level" and the Overgrowth section's
// "an absent ring reads as none or not assessed, which are treated the same."
const RING_WIDTH: Record<Overgrowth, number> = {
  minimal: 0,
  light: 2,
  thick: 3.5,
  overtaken: 5,
};

function renderRing(shape: SpotFunction, level: Overgrowth): string {
  const width = RING_WIDTH[level];
  if (width === 0) return "";
  return `<path d="${PIN_PATHS[shape]}" fill="none" stroke="${OVERGROWTH_RING_COLOR}" stroke-width="${width}" stroke-linejoin="round"/>`;
}

// Bloom, on the glyph -- see local/reclassification-plan.md's Bloom section.
// Rendering depends on Focus: forbs paint pink directly onto the pollinator
// glyph's own petals, filling bloom.petalCount of the six (ceil of the
// bloom-month count over two); shrubs and trees get a ring of that same
// count of small marks around the glyph perimeter, a presence/rough-count
// signal rather than the full forbs duration display. Every other Focus
// (grasses, ferns, none) never carries bloom -- see the plan's Bloom section
// ("decorates whichever glyph carries it: forbs, shrubs, and trees").
const GLYPH_CENTER = { cx: 7, cy: 6 };

// g-pollinator's six petal tips, traced from its own path data with
// svgpath (abs() + farthest-point clustering from center (15,15) in its
// native 30x30 space) -- they land close to -90/-30/30/90/150/-150deg, the
// same 60-degree-apart order the old ellipse overlay already used for
// window i. Each entry is a wedge from center out past the icon's ~17-unit
// extent (radius 40, so the wedge's chord never cuts into the artwork) --
// used as a clip-path on a second, pink copy of the same <use>, so the
// "paint" lands exactly on the icon's real petals rather than a separately
// centered shape guessing where they are.
const POLLINATOR_WEDGE_PATHS = [
  "M15,15 L-5,-19.64 L35,-19.64 Z",
  "M15,15 L35,-19.64 L55,15 Z",
  "M15,15 L55,15 L35,49.64 Z",
  "M15,15 L35,49.64 L-5,49.64 Z",
  "M15,15 L-5,49.64 L-25,15 Z",
  "M15,15 L-25,15 L-5,-19.64 Z",
];

function renderForbsBloom(bloom: BloomSpec, glyphId: string): string {
  const transform = glyphTransform(glyphId);
  const defs = POLLINATOR_WEDGE_PATHS.map((path, i) =>
    i < bloom.petalCount
      ? `<clipPath id="pollinator-wedge-${i}"><path d="${path}"/></clipPath>`
      : "",
  ).join("");
  const wedges = POLLINATOR_WEDGE_PATHS.map((_, i) =>
    i < bloom.petalCount
      ? `<g transform="${transform}" color="${BLOOM_COLOR}">` +
        `<use href="/pins/glyph-sprite.svg#g-${glyphId}" clip-path="url(#pollinator-wedge-${i})"/></g>`
      : "",
  ).join("");
  return `<defs>${defs}</defs>${wedges}`;
}

function renderPerimeterBloom(bloom: BloomSpec): string {
  const { cx, cy } = GLYPH_CENTER;
  const radius = 7.5;
  const marks: string[] = [];
  for (let i = 0; i < bloom.petalCount; i++) {
    const angle = (i / bloom.petalCount) * 2 * Math.PI;
    const x = cx + radius * Math.sin(angle);
    const y = cy - radius * Math.cos(angle);
    marks.push(`<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="1.15" fill="${BLOOM_COLOR}"/>`);
  }
  return marks.join("");
}

function renderBloom(spec: PinSpec): string {
  if (!spec.bloom || !spec.glyph) return "";
  if (spec.glyph === FOCUS_GLYPH_ID.forbs) return renderForbsBloom(spec.bloom, spec.glyph);
  if (spec.glyph === FOCUS_GLYPH_ID.trees || spec.glyph === FOCUS_GLYPH_ID.shrubs) {
    return renderPerimeterBloom(spec.bloom);
  }
  return "";
}

export function renderPin(spec: PinSpec): string {
  const solid = spec.fill === "solid";
  const bodyStrokeWidth = solid ? 0.8 : 1.7;
  const path = PIN_PATHS[spec.shape];

  // Drawn first, wider than the body's own stroke on the same path: the
  // body painted on top covers the inner half, leaving only the outer band
  // visible as a ring around it.
  const trim =
    `<path d="${path}" fill="none" stroke="${TRIM_COLOR}" ` +
    `stroke-width="${bodyStrokeWidth + 2 * TRIM_WIDTH}" stroke-linejoin="round"/>`;

  const body = solid
    ? `<path d="${path}" fill="${PIN_BODY_COLOR.fill}" stroke="${PIN_BODY_COLOR.stroke}" stroke-width="0.8"/>`
    : `<path d="${path}" fill="#fff" stroke="${PIN_BODY_COLOR.fill}" stroke-width="1.7"/>`;

  const ring = renderRing(spec.shape, spec.ring);

  const glyph = spec.glyph
    ? `<g transform="${glyphTransform(spec.glyph)}" color="${spec.ink}">` +
      `<use href="/pins/glyph-sprite.svg#g-${spec.glyph}"/></g>`
    : "";

  const bloom = renderBloom(spec);

  return `<svg viewBox="-2 -2 28 38" width="28" height="38">${trim}${body}${ring}${glyph}${bloom}</svg>`;
}

// Map anchor: the tip, not the centre. Shifted with the viewBox origin --
// still the same point on the path (12, 33), just relative to (-2, -2) now.
export const PIN_ANCHOR = { x: 14, y: 35 };

// Fallback marker for when there's no glyph to draw -- e.g. a wild-function
// spot with no focus set, or a scoreboard category that spans many foci at
// once. Same teardrop outline as every other pin, dressed in neutral gray
// rather than any of the pin's own colors (it isn't asserting a
// function/focus meaning, just standing in for "no icon here").
export const DEFAULT_PIN_SVG =
  `<svg viewBox="-2 -2 28 38" width="28" height="38">` +
  `<path d="${PIN_PATHS.cultivated}" fill="none" stroke="#e8b64a" stroke-width="2.8" stroke-linejoin="round"/>` +
  `<path d="${PIN_PATHS.cultivated}" fill="#374151" stroke="#1f2937" stroke-width="0.8"/>` +
  `</svg>`;
