import { focusOptions } from "@/components/forms/spotOptions";
import { FOCUS_GLYPH_ID, bloomSpecFromMonths, resolvePin } from "@/lib/pins/resolvePin";
import { renderPin } from "@/lib/pins/renderPin";
import { WEED_LEVELS } from "@/taxonomy/weedLevels";

function samplePin(overgrowth: (typeof WEED_LEVELS)[number]["value"], stewarded: boolean) {
  return renderPin(
    resolvePin({
      spotFunction: "wild",
      focus: "trees",
      overgrowth,
      stewardId: stewarded ? "sample" : null,
      stewardIsOwner: false,
    }),
  );
}

const FILL_EXAMPLES = [
  { svg: samplePin("minimal", true), label: "Stewarded — active care" },
  { svg: samplePin("minimal", false), label: "Open — no steward yet" },
];

// weed_level's wording is provisional and owned by taxonomy/weedLevels.ts —
// this reads the labels rather than restating them. Same stored values as
// before the reclassification; only the labels moved from weed-severity
// wording to the Overgrowth vocabulary -- see
// local/reclassification-migration.md's Overgrowth section.
const RING_EXAMPLES = WEED_LEVELS.filter((level) => level.value !== "minimal").map(
  (level) => ({
    svg: renderPin(
      resolvePin({
        spotFunction: "wild",
        focus: "trees",
        overgrowth: level.value,
        stewardId: null,
        stewardIsOwner: false,
      }),
    ),
    label: level.label,
    description: level.short,
  }),
);

// Bloom fills ceil(months / 2) of the forbs glyph's six petals, or the same
// count of perimeter dots on shrubs and trees -- see renderPin.ts.
function bloomPin(focus: "forbs" | "trees", months: number) {
  return renderPin(
    resolvePin({
      spotFunction: "wild",
      focus,
      overgrowth: "minimal",
      stewardId: null,
      stewardIsOwner: false,
      bloom: bloomSpecFromMonths(Array.from({ length: months }, (_, i) => i + 1)),
    }),
  );
}

const BLOOM_EXAMPLES = [
  { svg: bloomPin("forbs", 2), label: "1–2 months" },
  { svg: bloomPin("forbs", 6), label: "5–6 months" },
  { svg: bloomPin("forbs", 12), label: "11–12 months" },
  { svg: bloomPin("trees", 6), label: "Shrubs & trees: dots" },
];

export function MapLegend() {
  return (
    <div className="rounded-md border border-neutral-300 p-3 text-[15px]">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        {FILL_EXAMPLES.map(({ svg, label }) => (
          <div key={label} className="flex items-center gap-2">
            <div
              className="h-[38px] w-7"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
            <span>{label}</span>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1.5 border-t border-neutral-200 pt-3">
        {focusOptions
          .filter((option) => option.value !== "none")
          .map(({ value, label }) => (
            <div key={value} className="flex items-center gap-2">
              <img
                src={`/pins/glyph/g-${FOCUS_GLYPH_ID[value]}.svg`}
                alt=""
                className="h-5 w-5"
              />
              <span>{label}</span>
            </div>
          ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-neutral-200 pt-3">
        <span className="font-semibold">Flowering</span>
        {BLOOM_EXAMPLES.map(({ svg, label }) => (
          <div key={label} className="flex items-center gap-2">
            <div
              className="h-[38px] w-7"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
            <span>{label}</span>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-neutral-200 pt-3">
        <span className="font-semibold">Overgrowth</span>
        {RING_EXAMPLES.map(({ svg, label, description }) => (
          <div key={label} title={description} className="flex items-center gap-2">
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
