import { focusOptions, spotFunctionOptions } from "@/components/forms/spotOptions";
import { resolvePin } from "@/lib/pins/resolvePin";
import { renderPin } from "@/lib/pins/renderPin";

const FUNCTIONS = spotFunctionOptions;
const FOCI = focusOptions;

function Pin({ svg, caption }: { svg: string; caption: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="h-[38px] w-7" dangerouslySetInnerHTML={{ __html: svg }} />
      <span className="text-[10px] text-neutral-500">{caption}</span>
    </div>
  );
}

// Full shape x glyph matrix -- focus in rows, function in columns -- so a
// change to resolvePin's rules (which shape a function gets, which glyph a
// focus gets) is visible everywhere it applies at once, not just in the one
// or two combinations MapLegend happens to sample. "Wild + none" is skipped
// (n/a): that's the one combination resolveSpotPin's isSpot() rule treats as
// not a spot at all -- see apps/web/public/pins/README.md.
export function PinMatrix() {
  return (
    <table className="border-collapse text-sm">
      <thead>
        <tr>
          <th className="sticky left-0 bg-white p-2 text-left align-bottom">
            focus \ function
          </th>
          {FUNCTIONS.map((f) => (
            <th key={f.value} className="border-b border-neutral-200 p-2 text-center font-medium">
              {f.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {FOCI.map((focus) => (
          <tr key={focus.value} className="border-b border-neutral-100">
            <th className="sticky left-0 bg-white p-2 text-left font-normal text-neutral-600">
              {focus.label}
            </th>
            {FUNCTIONS.map((spotFunction) => {
              if (spotFunction.value === "wild" && focus.value === "none") {
                return (
                  <td key={spotFunction.value} className="p-2 text-center text-xs text-neutral-400">
                    n/a — not a spot
                  </td>
                );
              }
              const stewarded = renderPin(
                resolvePin({
                  spotFunction: spotFunction.value,
                  focus: focus.value,
                  overgrowth: "minimal",
                  stewardId: "sample",
                  stewardIsOwner: false,
                }),
              );
              const open = renderPin(
                resolvePin({
                  spotFunction: spotFunction.value,
                  focus: focus.value,
                  overgrowth: "minimal",
                  stewardId: null,
                  stewardIsOwner: false,
                }),
              );
              return (
                <td key={spotFunction.value} className="p-2">
                  <div className="flex justify-center gap-3">
                    <Pin svg={stewarded} caption="stewarded" />
                    <Pin svg={open} caption="open" />
                  </div>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
