import type { Focus as SharedFocus, WeedLevel } from "@placekeeping/shared-types";
import {
  bloomSpecFromMonths,
  resolvePin,
  isSpot,
  type Focus,
  type Overgrowth,
  type PinSpec,
  type SpotFunction,
} from "./resolvePin";

// spots.purpose still holds the old Function vocabulary (garden/monument/
// island/wild_area/none) until local/reclassification-migration.md's Phase 2
// actually ships -- this mapping is the same one Phase 2's SQL applies, run
// here at read time instead so the new pin-rendering code doesn't have to
// wait on that cutover. It's idempotent: once Phase 2 does ship and
// `purpose` already holds the new values, they fall straight through the
// switch's passthrough cases unchanged. Unrecognized/null falls back to
// "wild", matching the old toPinPurpose's wild_area fallback.
export function toSpotFunction(purpose: string | null): SpotFunction {
  switch (purpose) {
    case "garden":
      return "cultivated";
    case "wild_area":
      return "wild";
    case "monument":
      return "built";
    case "island":
      return "edge";
    case "cultivated":
    case "edge":
    case "built":
    case "wild":
      return purpose;
    default:
      return "wild";
  }
}

// spots.focus is null until local/reclassification-migration.md's Phase 3
// hand-reviews a spot -- rather than guessing from the deprecated
// `vegetation` column (the same ambiguity that made Phase 3 a per-spot
// review instead of a bulk mapping in the first place), an unreviewed spot
// just renders with no glyph, same as "none".
function toFocus(focus: SharedFocus | string | null): Focus {
  if (
    focus === "trees" ||
    focus === "shrubs" ||
    focus === "grasses" ||
    focus === "forbs" ||
    focus === "ferns"
  ) {
    return focus;
  }
  return "none";
}

// null means "no pin glyph applies" -- e.g. a wild spot with no focus set
// has nothing to draw a glyph for (there's no "none" glyph asset; see
// apps/web/public/pins/README.md's isSpot() rule). Callers should fall back
// to a default marker in that case.
export function resolveSpotPin(spot: {
  purpose: string | null;
  focus: SharedFocus | string | null;
  weedLevel: WeedLevel;
  stewardId: string | null;
  stewardIsOwner: boolean;
  bloomMonths: readonly number[];
}): PinSpec | null {
  const spotFunction = toSpotFunction(spot.purpose);
  const focus = toFocus(spot.focus);
  if (!isSpot({ spotFunction, focus })) return null;

  return resolvePin({
    spotFunction,
    focus,
    overgrowth: spot.weedLevel as Overgrowth,
    stewardId: spot.stewardId,
    stewardIsOwner: spot.stewardIsOwner,
    bloom: bloomSpecFromMonths(spot.bloomMonths),
  });
}
