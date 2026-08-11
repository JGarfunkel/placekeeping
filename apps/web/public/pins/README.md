# Placekeeping pins

Three fields resolve to one pin: `purpose`, `vegetation`, `weed_level` — plus whether a steward exists.

## The rules

| channel | carries | values |
|---|---|---|
| glyph | what is growing — including which *kind* of weed | 11 glyphs |
| colour | condition | green · orange · navy |
| fill | does anyone tend it | solid · outline |
| dot | how much of it there is | none · hollow ring · solid disc · double ring |

**Glyph.** `monument` always supplies its own. `garden` supplies its own only when
`vegetation` is `none`; otherwise it falls through to the vegetation glyph, same as
`wild_area`.

**Colour.** Monument is always navy. Orange fires whenever the *glyph itself* is a weed —
`garden` and `wild_area` can both produce that now that garden falls through to the
vegetation glyph. A weedy garden is no longer green; it reads exactly like a weedy wild
area, and the dot still carries how much.

**Dot.** Not suppressed when the glyph is already a weed — the glyph says WHICH weed, the dot
says HOW MUCH. An orange bramble pin with a light ring means brambles coming in at the edge; the
same pin with the overtaken mark means a wall of it. `weed_level` drives it: hollow ring for
light, solid disc for thick, a double ring for overtaken. The dot takes the same ink as the
glyph — white on solid pins, the pin colour on outline pins.

## Where weeds live

Two orthogonal fields. `vegetation` answers *what is growing*, including which kind of weed;
`weed_level` (`minimal` · `light` · `thick` · `overtaken`) answers *how much of it there is*.

Use `herbaceous_weeds` / `vigorous_weeds` as the **vegetation** only when weeds are essentially
all that is there — past a point weeds stop being a problem *on* the vegetation and become the
vegetation. Otherwise record what the place actually is and put the problem in `weed_level`.

A pollinator garden with bindweed is `vegetation: pollinator, weed_level: light` — still a
pollinator garden. A riverbank that is now solid knotweed is `vegetation: vigorous_weeds`. The
first keeps its identity; the second has lost it.

No token appears in both fields' vocabularies — `vigorous` describes the plants (a vegetation
value), `light`/`thick` describe the quantity (weed_level values). Choosing a weed vegetation
defaults `weed_level` to `thick` (a helpful default, not an enforced rule — see
`apps/web/src/taxonomy/vegetationWeedSync.ts`). `isPlace()` rejects `wild_area` + `none`: no
designated use and nothing growing is not a place.

## Files

```
resolvePin.ts       fields -> PinSpec. The whole decision, ~30 lines.
renderPin.ts        PinSpec -> SVG string. Composes body + <use> glyph + dot.
glyph-sprite.svg    all 11 glyphs as <symbol>, currentColor
glyph/              the same glyphs individually, for legends and filters
sample/             15 representative pins, pre-rendered
manifest.json       colours, glyph ids, and what each sample resolves to
```

Do **not** pre-render the full matrix — 11 glyphs × 3 colours × 2 fills × 3 dot states is well
over a hundred files, most never used. Compose at runtime: the body is one path, the glyph is a
`<use>`, the dot is a circle.

## Geometry

Pins are `viewBox="-2 -2 28 38"`. **The tip is at (12, 33)** in path coordinates — (14, 35) in
image-pixel coordinates, since the viewBox origin sits at (-2, -2). Use the pixel form as the map
anchor so the point lands on the coordinate, not the pin centre.

```js
L.icon({ iconUrl: url, iconSize: [28, 38], iconAnchor: [14, 35], popupAnchor: [0, -30] })
```

The canvas is bigger than the path itself (which still spans the original 24×34 region) so the
gold trim ring — see Colours below — has margin to sit outside the pin's own border without
getting clipped by the SVG viewport. Path, glyph, and dot coordinates are all still written in
the original 0–24 / 0–34 space; only the `<svg>` wrapper's viewBox/width/height moved.

## The one irregular glyph

`herbaceous_weeds` is a **15 × 22** box, not 15 × 15, so the dandelion stem reaches into the pin
wedge. It needs its own placement: `scale(19/22)` with the head centre landing at y 10.2. Drop it
into the square path and the stem disappears. `glyphTransform()` in `renderPin.ts` handles it.

## Colours

| token | fill | stroke | when |
|---|---|---|---|
| green | `#2f6b4f` | `#234f3b` | living land, weeds are not the story |
| orange | `#b03a0f` | `#8a2d09` | weeds are what is growing |
| navy | `#1f3a5f` | `#16293f` | a monument |

Orange is deliberately deep. A lighter burnt orange measured 2.75:1 against woodland-green
basemap fill — under the 3:1 floor, and weedy sites sit on woodland constantly. `#b03a0f` clears
3.93:1 there, gives the white glyph 6.07:1, and sits ΔE 82.7 from green (69.2 under deuteranopia).

Navy over bronze or grey for the same reason: against green, bronze falls to ΔE 13.2 under
deuteranopia and grey to 4.8. Navy holds at 32.

There was a brief detour to blue (with monument recoloured to a stone grey to avoid colliding
with it) to solve green blending into aerial-imagery tree canopy. That was reverted: instead the
app's default basemap changed from aerial imagery to a muted CARTO layer (see
`components/map/baseLayers.ts`) where green has no such problem, and every pin — regardless of
colour — got a thin gold trim ring (`#e8b64a`, `TRIM_WIDTH` in `renderPin.ts`) drawn just outside
its own border. The trim is what keeps green legible on aerial imagery for anyone who switches to
it. It's drawn on the same path as the body, one layer further out, with `stroke-linejoin="round"`
so it doesn't spike at the pin's bottom point — see Geometry above for why the canvas grew to fit
it.

## Licensing

Maki and Temaki are CC0; the NPS Symbol Library is US government public domain. Neither requires
attribution. `herbaceous_weeds` and `vigorous_weeds` were drawn for this project on Maki's 15px grid.
