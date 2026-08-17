import {
  spotPurposeOptions,
  vegetationOptions,
} from "@/components/forms/spotOptions";
import { resolvePin, type Purpose, type Vegetation } from "@/lib/pins/resolvePin";
import { renderPin } from "@/lib/pins/renderPin";
import { WEED_LEVELS } from "@/taxonomy/weedLevels";

// Every glyph the pin system can draw: monument always supplies its own;
// garden supplies its own only when vegetation is unset, otherwise it (like
// wild_area) falls through to the vegetation glyph. See
// apps/web/public/pins/README.md.
const GLYPH_LABELS = [
  ...spotPurposeOptions.filter(
    (option) => option.value === "garden" || option.value === "monument",
  ),
  ...vegetationOptions.filter((option) => option.value !== "none"),
].map((option) => ({ glyph: option.value, label: option.label }));

function samplePin(purpose: Purpose, vegetation: Vegetation, stewarded: boolean) {
  return renderPin(
    resolvePin({
      purpose,
      vegetation,
      weedLevel: "minimal",
      stewardId: stewarded ? "sample" : null,
      stewardIsOwner: false,
    }),
  );
}

const FILL_AND_COLOR_EXAMPLES = [
  {
    svg: samplePin("wild_area", "woodland", true),
    label: "Stewarded — active care",
  },
  {
    svg: samplePin("wild_area", "woodland", false),
    label: "Open — no steward yet",
  },
  {
    svg: samplePin("wild_area", "vigorous_weeds", false),
    label: "Predominantly weeds",
  }
];

// weed_level's wording is provisional and owned by taxonomy/weedLevels.ts —
// this reads the labels rather than restating them.
const DOT_EXAMPLES = WEED_LEVELS.filter((level) => level.value !== "minimal").map(
  (level) => ({
    svg: renderPin(
      resolvePin({
        purpose: "wild_area",
        vegetation: "woodland",
        weedLevel: level.value,
        stewardId: null,
        stewardIsOwner: false,
      }),
    ),
    label: `${level.label} — ${level.short}`,
  }),
);

export function MapLegend() {
  return (
    <div className="rounded-md border border-neutral-300 p-3 text-xs">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        {FILL_AND_COLOR_EXAMPLES.map(({ svg, label }) => (
          <div key={label} className="flex items-center gap-2">
            <div
              className="h-[38px] w-7"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
            <span>{label}</span>
          </div>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 border-t border-neutral-200 pt-3 sm:grid-cols-4">
        {GLYPH_LABELS.map(({ glyph, label }) => (
          <div key={glyph} className="flex items-center gap-2">
            <img
              src={`/pins/glyph/g-${glyph}.svg`}
              alt=""
              className="h-4 w-4"
            />
            <span>{label}</span>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-neutral-200 pt-3">
        {DOT_EXAMPLES.map(({ svg, label }) => (
          <div key={label} className="flex items-center gap-2">
            <div
              className="h-[38px] w-7"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
