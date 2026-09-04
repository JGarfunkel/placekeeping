# Placekeeping pins

Five fields resolve to one pin: `purpose` (Function), `focus` (Focus), `weed_level` (Overgrowth), the six `bloom_*` windows, plus whether a steward exists. See `local/reclassification-plan.md` for the design and `local/reclassification-migration.md` for how the DB gets there. This replaces the old three-field (`purpose`/`vegetation`/`weed_level`) scheme; see git history for that version of this file if you need it.

## The rules

| channel | carries | values |
| --- | --- | --- |
| shape | Function -- what kind of place this is | round (cultivated) · flat-top (edge) · square (built) · 5-spike crown (wild) |
| glyph | Focus -- the dominant vegetation layer | 6 Focus values, `none` draws no glyph |
| fill | Stewardship -- does anyone tend it | solid · outline |
| ring | Overgrowth -- how much smother there is | none (no ring) · present · occluding · overwhelmed, thickening inward |
| pink marks | Bloom -- how long/how much is blooming | on the glyph, forbs/shrubs/trees only |

**Shape.** `resolveSpotPin`/`resolveObservationPin` map `purpose` to a `SpotFunction` (`toSpotFunction` in `resolveSpotPin.ts`) — this mapping is the same one `local/reclassification-migration.md`'s Phase 2 SQL applies, run at read time so pin code doesn't have to wait on that cutover, and it's idempotent (safe whether `purpose` still holds the old values or the new ones). `PIN_PATHS` in `renderPin.ts` has one path per `SpotFunction`, built from a shared base circle and taper so all four stay the same overall size/anchor.

**Glyph.** Focus alone decides the glyph now — unlike the old scheme, Function supplies no glyph fallback at all (it's pure shape). `FOCUS_GLYPH_ID` in `resolvePin.ts` maps each Focus to a glyph-sprite id; `trees`/`grasses`/`forbs` reuse existing artwork under their old vegetation-keyed ids (`woodland`/`grassland`/`pollinator`), `ferns`/`shrubs` are new. `focus: none` draws nothing.

**Fill.** Unchanged from the old scheme: solid for stewarded (or `stewardIsOwner`), outline for adoptable.

**Ring.** Not suppressed when there's also a glyph — same reasoning the old dot used (the glyph says what's growing, the ring says how overgrown). Drawn as a stroke on the same path as the pin body, so it follows whichever shape is active; `renderRing` in `renderPin.ts`. `weed_level` itself is unchanged — same four stored values as always (`minimal`/`light`/`thick`/`overtaken`); only the *labels* moved to the Overgrowth wording, in `apps/web/src/taxonomy/weedLevels.ts`. See `local/reclassification-migration.md`'s Overgrowth section.

**Bloom.** Only forbs, shrubs, and trees ever carry it (see `local/reclassification-plan.md`'s Bloom section). Forbs paint pink directly onto the `g-pollinator` glyph's own petals, one per two-month window that's blooming: a second, pink-colored copy of the same `<use>` is layered on top of the base icon, clipped to a 60-degree wedge per window (`POLLINATOR_WEDGE_PATHS` in `renderPin.ts`, traced from the icon's actual path data so the wedges land on the real petals rather than a separately-centered shape). Off-season windows draw nothing -- the base icon's own ink color already reads as "not blooming" there. Shrubs and trees get a ring of small pink marks around the glyph, one per bloom window -- presence/rough-count only, not the full forbs duration display. `bloomSpecFromWindows` in `resolvePin.ts` turns the six raw booleans into a `BloomSpec | null`; `renderBloom` in `renderPin.ts` picks the rendering by glyph id.

## Where things live

Two fields on `spots` are being phased out together, on the same schedule (`local/reclassification-migration.md`): `vegetation` (replaced by `focus`) and, less directly, `purpose`'s old value set (replaced in place, not a new column). `observations` gets its own `focus` the same way, replacing `observations.vegetation`; `observations.setting` was deliberately never added since setting doesn't change visit to visit.

A per-visit `species_blooming` count also exists (`observations.species_blooming`) but never feeds the pin -- it's a distinct richness signal, see `local/reclassification-plan.md`'s Observation section.

## Files

```
resolvePin.ts          Function/Focus/Overgrowth/Bloom -> PinSpec. Local types only (SpotFunction/Focus/Overgrowth/BloomSpec), decoupled from the DB-facing shared-types package.
resolveSpotPin.ts       DB-shaped spot row -> PinSpec | null. Bridges old `purpose` values and null `focus` -- see toSpotFunction/toFocus.
resolveObservationPin.ts  DB-shaped observation row -> PinSpec | null. No Function of its own (fixed to "cultivated" as a neutral stand-in); no bloom.
renderPin.ts            PinSpec -> SVG string. Composes trim + body + ring + glyph + bloom.
glyph-sprite.svg        all glyphs as <symbol>, currentColor
glyph/                  the same glyphs individually, for legends and filters
sample/, manifest.json  STALE -- describe the pre-reclassification 3-field scheme. Not read by any app code (grep confirms). Regenerate from the live /dev/pins page (PinMatrix) rather than trusting these until then.
```

Do **not** pre-render the full matrix as static files — visit `/dev/pins` in a running dev server instead (`PinMatrix.tsx`), which renders every Focus x Function combination live off the real `resolvePin`/`renderPin` code, so it can never drift from what's actually shipped.

## Geometry

Pins are `viewBox="-2 -2 28 38"`. **The tip is at (12, 33)** in path coordinates — (14, 35) in image-pixel coordinates, since the viewBox origin sits at (-2, -2). Use the pixel form as the map anchor so the point lands on the coordinate, not the pin centre.

```js
L.icon({ iconUrl: url, iconSize: [28, 38], iconAnchor: [14, 35], popupAnchor: [0, -30] })
```

All four `PIN_PATHS` share a base circle (center (12, 11.5), radius 10.5) and the same lower taper down to the tip (`TAPER_RIGHT`/`TAPER_LEFT` in `renderPin.ts`) — they differ only in how the rim is drawn between the leftmost and rightmost points, over the top. This keeps every shape the same overall size and map anchor.

The canvas is bigger than the path itself (which still spans the original 24×34 region) so the gold trim ring — see Colors below — has margin to sit outside the pin's own border without getting clipped by the SVG viewport.

## Colors

Unlike the old scheme, color no longer carries Function/category at all — that moved to shape. Every pin body is the same fixed green (`PIN_BODY_COLOR` in `resolvePin.ts`, the same green "wild area" pins used before, so the basemap-legibility work below still applies). Two accent hues layer on top:

| token | value | when |
| --- | --- | --- |
| body | `#2f6b4f` fill / `#234f3b` stroke | every pin |
| Overgrowth ring | `#c8781f` | `weed_level` above `minimal` |
| Bloom pink | `#b5296b` | a bloom window is true, on forbs/shrubs/trees only |

Every pin — regardless of the above — also gets a thin gold trim ring (`#e8b64a`, `TRIM_WIDTH` in `renderPin.ts`) drawn just outside its own border, which is what keeps it legible against aerial-imagery tree canopy on the basemaps that offer it (see `components/map/baseLayers.ts`). It's drawn on the same path as the body, one layer further out, with `stroke-linejoin="round"` so it doesn't spike at the pin's bottom point.

## Licensing

Maki and Temaki are CC0; the NPS Symbol Library is US government public domain. Neither requires attribution. `herbaceous_weeds` and `vigorous_weeds` were drawn for this project on Maki's 15px grid, same as `ferns` and `shrubs`.
