import type { SpotPurpose, Vegetation, WeedLevel } from "@placekeeping/shared-types";
import { resolvePin, isSpot, type Purpose, type PinSpec } from "./resolvePin";

function toPinPurpose(purpose: SpotPurpose | null): Purpose {
  if (purpose === "garden") return "garden";
  if (purpose === "monument") return "monument";
  return "wild_area"; // wild_area, none, or null fall through
}

// null means "no pin glyph applies" — e.g. wild_area purpose with no
// vegetation set has nothing to draw a glyph for (there's no "none" glyph
// asset; see apps/web/public/pins/README.md's isSpot() rule). Callers
// should fall back to a default marker in that case.
export function resolveSpotPin(spot: {
  purpose: SpotPurpose | null;
  vegetation: Vegetation | null;
  weedLevel: WeedLevel;
  stewardId: string | null;
}): PinSpec | null {
  const purpose = toPinPurpose(spot.purpose);
  const vegetation = spot.vegetation ?? "none";
  if (!isSpot({ purpose, vegetation })) return null;
  return resolvePin({
    purpose,
    vegetation,
    weedLevel: spot.weedLevel,
    stewardId: spot.stewardId,
  });
}
