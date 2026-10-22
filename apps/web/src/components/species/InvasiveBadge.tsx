import type { InvasiveInfo, InvasiveSeverity } from "@placekeeping/shared-types";

// Marks a species that a regulator lists as invasive. Presentational only:
// callers pass the taxon's `invasive` info (from taxon_listings), and a
// species with no listing renders nothing. Shape carries the severity as well as color, so
// it still reads for color-blind users and in grayscale.
const SEVERITY: Record<
  InvasiveSeverity,
  { label: string; color: string; shape: "octagon" | "triangle" | "diamond" }
> = {
  prohibited: {
    label: "Prohibited invasive",
    color: "text-red-600",
    shape: "octagon",
  },
  regulated: {
    label: "Regulated invasive",
    color: "text-orange-500",
    shape: "triangle",
  },
  listed: {
    label: "Listed invasive",
    color: "text-amber-500",
    shape: "diamond",
  },
};

const PATH = {
  octagon: "M8.5 2h7L22 8.5v7L15.5 22h-7L2 15.5v-7z",
  triangle: "M12 3 22 20H2z",
  diamond: "M12 2 22 12 12 22 2 12z",
};

export function InvasiveBadge({ invasive }: { invasive?: InvasiveInfo | null }) {
  if (!invasive) return null;
  const { label, color, shape } = SEVERITY[invasive.severity];
  const detail = [invasive.jurisdiction, invasive.tier && `Tier ${invasive.tier}`]
    .filter(Boolean)
    .join(" ");
  const title = `${label} (${detail})`;
  return (
    <span
      className={`inline-flex align-text-bottom ${color}`}
      title={title}
      role="img"
      aria-label={title}
    >
      <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true">
        <path d={PATH[shape]} fill="currentColor" />
        <path
          d="M12 7v6.5M12 16v1.5"
          stroke="#fff"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    </span>
  );
}
