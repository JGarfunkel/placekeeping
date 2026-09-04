import type { WeedLevel } from "@placekeeping/shared-types";

// PROVISIONAL. The thick/overtaken boundary in particular is a judgment call
// awaiting review by ecologists. Revise here; every surface reads from this
// — do not copy these strings into form labels, tooltips, the guide, or map
// legends.
//
// Relabeled Overgrowth per local/reclassification-plan.md -- `value` (and
// weed_level's stored data) is unchanged, this is a display-only rename. See
// local/reclassification-migration.md's Overgrowth section and
// OVERGROWTH_LABELS in @placekeeping/shared-types, which carries the same
// four labels for callers that just need the short form.
export const WEED_LEVELS: {
  value: WeedLevel;
  label: string;
  short: string;
  help: string;
}[] = [
  {
    value: "minimal",
    label: "None",
    short: "No overgrowth to speak of",
    help: "Spot is regularly weeded, or nothing is smothering it.",
  },
  {
    value: "light",
    label: "Present",
    short: "Noticeable but not yet competing",
    help: "Coming in at the edge. A short session would clear it.",
  },
  {
    value: "thick",
    label: "Occluding",
    short: "Crowding out what was planted",
    help: "Overgrowth is winning ground but the original planting is still there.",
  },
  {
    value: "overtaken",
    label: "Overwhelmed",
    short: "Overgrowth is dominant",
    help: "Little or nothing of the original planting remains visible.",
  },
];
