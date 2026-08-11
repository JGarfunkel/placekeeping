# Placekeeping pins

Three fields resolve to one pin: `purpose`, `vegetation`, `weed_level` — plus whether a steward exists.

## The rules

| channel | carries | values |
|---|---|---|
| glyph | what is growing — including which *kind* of weed | 11 glyphs |
| color | type | green · pink · grey |
| fill | does anyone tend it | solid · outline |
| dot | how much of it there is | none · hollow ring · solid disc · double ring |

**Glyph.** `vegetation` wins whenever it's set to anything but `none` — including on a
monument, since what's actually growing there is more informative than a fixed obelisk.
`monument` and `garden` each supply their own glyph only as a fallback, for when there's
nothing growing to draw instead.

**Color.** Purpose only: green for `wild_area`, pink for `garden`, grey for `monument`.
Condition plays no part — a weedy garden is still pink, a weedy wild area is still green;
weediness lives entirely in the dot now.

**Dot.** Not suppressed when the glyph is already a weed — the glyph says WHICH weed, the dot
says HOW MUCH. A pin with a light ring means brambles coming in at the edge; the same pin with
the overtaken mark means a wall of it. `weed_level` drives it: hollow ring for light, solid disc
for thick, a double ring for overtaken. The dot is a fixed near-black on every pin, independent
of the pin's own color or ink — see Colors below for why.

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
manifest.json       colors, glyph ids, and what each sample resolves to
```

Do **not** pre-render the full matrix — 11 glyphs × 3 colors × 2 fills × 3 dot states is well
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
gold trim ring — see Colors below — has margin to sit outside the pin's own border without
getting clipped by the SVG viewport. Path, glyph, and dot coordinates are all still written in
the original 0–24 / 0–34 space; only the `<svg>` wrapper's viewBox/width/height moved.

## The one irregular glyph

`herbaceous_weeds` is a **15 × 22** box, not 15 × 15, so the dandelion stem reaches into the pin
wedge. It needs its own placement: `scale(19/22)` with the head centre landing at y 10.2. Drop it
into the square path and the stem disappears. `glyphTransform()` in `renderPin.ts` handles it.

## Colors

| token | fill | stroke | when |
|---|---|---|---|
| green | `#2f6b4f` | `#234f3b` | wild area |
| pink | `#b5296b` | `#8a1f52` | garden |
| grey | `#5c5347` | `#443d34` | monument |

Grey is warm-stone, not neutral, on purpose. An earlier neutral/cool-leaning grey (tried both
here and in the blue detour below) collapses toward green under deuteranopia — simulated ΔE
dropped to ~8, matching the ΔE 4.8 that ruled grey out the first time this was tried. Shifting
the grey warm moves it off that red-green confusion line: simulated ΔE holds at ~21 against
green, white glyph ink gets 7.54:1, and it clears 5.76:1 against the muted-basemap fill.

Weed condition used to live in this channel too (an `orange` fired whenever the vegetation glyph
itself was a weed) but that conflated two independent signals — a stewarded weedy site and an
unstewarded one both went orange for different reasons. Condition now lives only in the dot,
which is why the dot is a fixed near-black rather than taking the pin's own color: it has to
read as a severity mark against green, pink, *and* grey alike, not blend into whichever one it's
drawn over.

There was a brief detour to blue (with monument recolored to a stone grey to avoid colliding
with it) to solve green blending into aerial-imagery tree canopy. That was reverted: instead the
app's default basemap changed from aerial imagery to a muted CARTO layer (see
`components/map/baseLayers.ts`) where green has no such problem, and every pin — regardless of
color — got a thin gold trim ring (`#e8b64a`, `TRIM_WIDTH` in `renderPin.ts`) drawn just outside
its own border. The trim is what keeps green legible on aerial imagery for anyone who switches to
it. It's drawn on the same path as the body, one layer further out, with `stroke-linejoin="round"`
so it doesn't spike at the pin's bottom point — see Geometry above for why the canvas grew to fit
it.

## Licensing

Maki and Temaki are CC0; the NPS Symbol Library is US government public domain. Neither requires
attribution. `herbaceous_weeds` and `vigorous_weeds` were drawn for this project on Maki's 15px grid.
