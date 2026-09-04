import type { Focus as SharedFocus, WeedLevel } from "@placekeeping/shared-types";
import { resolvePin, type Overgrowth, type PinSpec } from "./resolvePin";

// Unlike resolveSpotPin, an observation has no Function of its own -- only
// what was actually growing on that visit. Shape is fixed to "cultivated"
// (plain round) as a neutral stand-in, the same role "wild_area" played as
// an arbitrary-but-consistent placeholder before Function existed. Bloom is
// always null here too: species_blooming (the per-visit richness count) is a
// distinct signal from the spot's static bloom-window duration, and doesn't
// feed the pin -- see local/reclassification-plan.md's Observation section.
//
// Returns null when there's nothing to draw -- no focus recorded on this
// observation (never set, or logged before the column existed and not yet
// backfilled). Callers should just omit the glyph in that case.
export function resolveObservationPin(obs: {
  focus: SharedFocus | string | null;
  weedLevel: WeedLevel | null;
  stewardId: string | null;
}): PinSpec | null {
  if (!obs.focus || obs.focus === "none") return null;
  return resolvePin({
    spotFunction: "cultivated",
    focus: obs.focus as SharedFocus,
    overgrowth: (obs.weedLevel ?? "minimal") as Overgrowth,
    stewardId: obs.stewardId,
    // Observations have no stewardIsOwner of their own -- only spots.stewardId
    // is snapshotted here (see stewardId above), so ownership never applies.
    stewardIsOwner: false,
  });
}
