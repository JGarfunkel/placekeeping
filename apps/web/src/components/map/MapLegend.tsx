import { focusOptions } from "@/components/forms/spotOptions";
import { FOCUS_GLYPH_ID, resolvePin } from "@/lib/pins/resolvePin";
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
    label: `${level.label} — ${level.short}`,
  }),
);

export function MapLegend() {
  return (
    <div className="rounded-md border border-neutral-300 p-3 text-xs">
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

      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 border-t border-neutral-200 pt-3 sm:grid-cols-4">
        {focusOptions
          .filter((option) => option.value !== "none")
          .map(({ value, label }) => (
            <div key={value} className="flex items-center gap-2">
              <img
                src={`/pins/glyph/g-${FOCUS_GLYPH_ID[value]}.svg`}
                alt=""
                className="h-4 w-4"
              />
              <span>{label}</span>
            </div>
          ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-neutral-200 pt-3">
        {RING_EXAMPLES.map(({ svg, label }) => (
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
