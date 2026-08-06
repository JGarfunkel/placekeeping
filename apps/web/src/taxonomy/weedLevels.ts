import type { WeedLevel } from "@placekeeping/shared-types";

// PROVISIONAL. The thick/overtaken boundary in particular is a judgment call
// awaiting review by ecologists. Revise here; every surface reads from this
// — do not copy these strings into form labels, tooltips, the guide, or map
// legends.
export const WEED_LEVELS: {
  value: WeedLevel;
  label: string;
  short: string;
  help: string;
}[] = [
  {
    value: "minimal",
    label: "Minimal",
    short: "Weeds present but not a concern",
    help: "Spot is regularly weeded.",
  },
  {
    value: "light",
    label: "Light",
    short: "Can be easily pulled",
    help: "Noticeable but not yet competing. A short session would clear it.",
  },
  {
    value: "thick",
    label: "Thick",
    short: "Requires substantial effort to clear",
    help: "Weeds are winning ground but the original planting is still there.",
  },
  {
    value: "overtaken",
    label: "Overtaken",
    short: "Weeds are dominant",
    help: "Little or nothing of the original planting remains visible.",
  },
];
