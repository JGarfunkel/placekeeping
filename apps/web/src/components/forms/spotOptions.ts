import type {
  Focus,
  PlaceAccess,
  Setting,
  SpotFunction,
  SpotPurpose,
  Vegetation,
} from "@placekeeping/shared-types";
import { WEED_LEVELS } from "@/taxonomy/weedLevels";

// Deprecated -- see local/reclassification-plan.md. Kept only for reading
// data that hasn't been through Phase 3/4 review yet (e.g. an old spot's
// still-populated `vegetation`, displayed read-only); no longer offered in
// any form. Use focusOptions/settingOptions instead.
export const vegetationOptions: { value: Vegetation; label: string }[] = [
  { value: "vegetable_herb", label: "Vegetable / herb" },
  { value: "ornamental", label: "Ornamental" },
  { value: "pollinator", label: "Pollinator" },
  { value: "wetland", label: "Wetland" },
  { value: "woodland", label: "Woodland" },
  { value: "grassland", label: "Grassland" },
  { value: "mowed_lawn", label: "Mowed lawn" },
  { value: "herbaceous_weeds", label: "Herbaceous weeds" },
  { value: "vigorous_weeds", label: "Vigorous weeds" },
  { value: "none", label: "None" },
];

export const weedLevelOptions = WEED_LEVELS.map(({ value, label }) => ({
  value,
  label,
}));

// Deprecated -- see local/reclassification-plan.md. Kept for the same
// read-only reason as vegetationOptions above. Use spotFunctionOptions.
export const spotPurposeOptions: { value: SpotPurpose; label: string }[] = [
  { value: "garden", label: "Garden" },
  { value: "monument", label: "Monument/Memorial" },
  { value: "island", label: "Traffic island" },
  { value: "wild_area", label: "Wild area" },
  { value: "none", label: "None" },
];

// Function vocabulary -- see local/reclassification-plan.md. Live in every
// form now; still stored in the `purpose` column (see spotFunctionSchema in
// @placekeeping/shared-types) until local/reclassification-migration.md's
// Phase 2 renames it.
export const spotFunctionOptions: { value: SpotFunction; label: string }[] = [
  { value: "cultivated", label: "Cultivated" },
  { value: "edge", label: "Edge" },
  { value: "built", label: "Built" },
  { value: "wild", label: "Wild" },
];

// Keeper-facing labels from local/reclassification-plan.md's Focus table.
export const focusOptions: { value: Focus; label: string }[] = [
  { value: "trees", label: "Trees" },
  { value: "shrubs", label: "Shrubs" },
  { value: "grasses", label: "Grasses" },
  { value: "forbs", label: "Flowering herbaceous" },
  { value: "ferns", label: "Ferns or mosses" },
  { value: "none", label: "None" },
];

// See local/reclassification-plan.md -- "position on the map already carries
// setting" is true for a human looking at the pin, but the field still needs
// a value at data-entry time (e.g. distinguishing a roadside/plaza spot as
// urban, which the map alone can't infer).
export const settingOptions: { value: Setting; label: string }[] = [
  { value: "upland", label: "Upland" },
  { value: "wetland", label: "Wetland" },
  { value: "coastal", label: "Coastal" },
  { value: "alpine", label: "Alpine" },
  { value: "urban", label: "Urban" },
];

export const sitePurposeOptions: { value: string; label: string }[] = [
  { value: "community_garden", label: "Community garden" },
  { value: "civic building", label: "Civic building" },
  { value: "cemetery", label: "Cemetery" },
  { value: "farm", label: "Farm" },
  { value: "greenway", label: "Greenway" },
  { value: "historic_site", label: "Historic site" },
  { value: "natural_area", label: "Natural area" },
  { value: "park", label: "Park" },
  { value: "recreation", label: "Recreation" },
  { value: "trails", label: "Trails" },
  { value: "multipurpose", label: "Multipurpose" },
  { value: "preserve", label: "Preserve" },
  { value: "school", label: "School" },
];

export const placeAccessOptions: { value: PlaceAccess; label: string }[] = [
  { value: "public", label: "Public" },
  { value: "none", label: "None" },
  { value: "private_club", label: "Private club" },
  { value: "school", label: "School" },
  { value: "visible_from_street", label: "Visible from street" },
];
