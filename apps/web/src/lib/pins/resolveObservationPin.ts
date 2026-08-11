import type { Vegetation, WeedLevel } from "@placekeeping/shared-types";
import { resolvePin, type PinSpec } from "./resolvePin";

// Unlike resolveSpotPin, an observation has no `purpose` of its own -- only
// what was actually growing on that visit. So vegetation always wins here
// and there's no monument glyph: a monument spot's observation still shows
// what was growing around it that day, not the monument icon. Passing
// purpose "wild_area" (which never supplies its own glyph, see resolvePin)
// is what gets that for free.
//
// Returns null when there's nothing to draw -- no vegetation recorded on
// this observation (never set, or logged before the columns existed and not
// yet backfilled). Callers should just omit the glyph in that case.
export function resolveObservationPin(obs: {
  vegetation: Vegetation | null;
  weedLevel: WeedLevel | null;
  stewardId: string | null;
}): PinSpec | null {
  if (!obs.vegetation || obs.vegetation === "none") return null;
  return resolvePin({
    purpose: "wild_area",
    vegetation: obs.vegetation,
    weedLevel: obs.weedLevel ?? "minimal",
    stewardId: obs.stewardId,
  });
}
