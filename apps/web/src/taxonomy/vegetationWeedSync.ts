import { WEED_VEGETATION, type Vegetation, type WeedLevel } from "@placekeeping/shared-types";

export type Field = "vegetation" | "weedLevel";

const WEED_VEGETATION_DEFAULT: WeedLevel = "thick";

export interface EditState {
  vegetation: Vegetation | "";
  weedLevel: WeedLevel;
  touched: Set<Field>;
}

// Choosing a weed as the vegetation moves the level slider to "thick", then
// leaves it alone — thick rather than overtaken, because naming weeds as the
// vegetation means they dominate, not that nothing else survives. The
// `touched` guard is the difference between a helpful default and a fight
// with the form: without it, someone who sets the level to "overtaken" and
// then edits the vegetation would watch their answer snap back to "thick".
export function onVegetationChange(
  s: EditState,
  next: Vegetation | "",
): EditState {
  s.vegetation = next;
  s.touched.add("vegetation");

  if (!s.touched.has("weedLevel") && next && WEED_VEGETATION.has(next)) {
    s.weedLevel = WEED_VEGETATION_DEFAULT;
  }
  return s;
}

// The reverse direction never writes back to vegetation — only the
// contributor knows which kind of weed, if any, "overtaken" means here.
export function onWeedLevelChange(s: EditState, next: WeedLevel): EditState {
  s.weedLevel = next;
  s.touched.add("weedLevel");
  return s;
}

export function overtakenPrompt(s: EditState): string | null {
  if (s.weedLevel !== "overtaken") return null;
  if (s.vegetation && WEED_VEGETATION.has(s.vegetation)) return null;
  return "If the weeds have taken over, is that now what is growing here?";
}

export function weedLevelWarning(s: EditState): string | null {
  if (
    s.vegetation &&
    WEED_VEGETATION.has(s.vegetation) &&
    s.weedLevel === "minimal"
  ) {
    return "Weeds are recorded as the main vegetation here, but the level says minimal.";
  }
  return null;
}
