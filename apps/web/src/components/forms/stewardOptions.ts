import type { GroupStewardType } from "@placekeeping/shared-types";

export const groupStewardTypeOptions: { value: GroupStewardType; label: string }[] = [
  { value: "school", label: "School" },
  { value: "club", label: "Club" },
  { value: "nonprofit", label: "Nonprofit" },
  { value: "municipality", label: "Municipality" },
];
