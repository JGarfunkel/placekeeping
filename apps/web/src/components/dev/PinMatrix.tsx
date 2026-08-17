import { vegetationOptions } from "@/components/forms/spotOptions";
import { isSpot, resolvePin, type Purpose } from "@/lib/pins/resolvePin";
import { renderPin } from "@/lib/pins/renderPin";

const PURPOSES: { value: Purpose; label: string }[] = [
  { value: "wild_area", label: "Wild area" },
  { value: "garden", label: "Garden" },
  { value: "monument", label: "Monument" },
];

function Pin({ svg, caption }: { svg: string; caption: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="h-[38px] w-7" dangerouslySetInnerHTML={{ __html: svg }} />
      <span className="text-[10px] text-neutral-500">{caption}</span>
    </div>
  );
}

// Full glyph x color x fill matrix -- vegetation in rows, purpose in
// columns -- so a change to resolvePin's fallback rules (which glyph wins,
// which color a purpose gets) is visible everywhere it applies at once,
// not just in the one or two combinations MapLegend happens to sample.
export function PinMatrix() {
  return (
    <table className="border-collapse text-sm">
      <thead>
        <tr>
          <th className="sticky left-0 bg-white p-2 text-left align-bottom">
            vegetation \ purpose
          </th>
          {PURPOSES.map((p) => (
            <th key={p.value} className="border-b border-neutral-200 p-2 text-center font-medium">
              {p.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {vegetationOptions.map((veg) => (
          <tr key={veg.value} className="border-b border-neutral-100">
            <th className="sticky left-0 bg-white p-2 text-left font-normal text-neutral-600">
              {veg.label}
            </th>
            {PURPOSES.map((p) => {
              if (!isSpot({ purpose: p.value, vegetation: veg.value })) {
                return (
                  <td key={p.value} className="p-2 text-center text-xs text-neutral-400">
                    n/a — not a spot
                  </td>
                );
              }
              const stewarded = renderPin(
                resolvePin({
                  purpose: p.value,
                  vegetation: veg.value,
                  weedLevel: "minimal",
                  stewardId: "sample",
                  stewardIsOwner: false,
                }),
              );
              const open = renderPin(
                resolvePin({
                  purpose: p.value,
                  vegetation: veg.value,
                  weedLevel: "minimal",
                  stewardId: null,
                  stewardIsOwner: false,
                }),
              );
              return (
                <td key={p.value} className="p-2">
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
