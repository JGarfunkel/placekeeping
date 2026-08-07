import type {
  PlaceAccess,
  SpotPurpose,
  Vegetation,
} from "@placekeeping/shared-types";
import { WEED_LEVELS } from "@/taxonomy/weedLevels";

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

export const spotPurposeOptions: { value: SpotPurpose; label: string }[] = [
  { value: "garden", label: "Garden" },
  { value: "monument", label: "Monument or Memorial" },
  { value: "wild_area", label: "Wild area" },
  { value: "none", label: "None" },
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
