// Input guidance / display grouping for observations.speciesBlooming -- see
// local/reclassification-plan.md's Observation section. The stored value is
// always the raw integer a contributor picks here, never the bin itself, so
// these bins can be re-drawn later without touching stored data. `value:
// null` means "not recorded" -- the field is nullable/optional, unlike
// weed_level, so the slider needs its own explicit unset position. Shared by
// ObservationForm and QuickAddSpotDialog (see SPECIES_BLOOMING_BINS.findIndex
// usage in both).
export const SPECIES_BLOOMING_BINS: { value: number | null; label: string }[] = [
  { value: 0, label: "0" },
  { value: 1, label: "1" },
  { value: 2, label: "2" },
  { value: 3, label: "3" },
  { value: 4, label: "4" },
  { value: 5, label: "5" },
  { value: 6, label: "6+" },
];
