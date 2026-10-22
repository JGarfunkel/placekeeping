import type { Taxon } from "@placekeeping/shared-types";
import { InvasiveBadge } from "@/components/species/InvasiveBadge";

// Verified species across all of a spot's observations, de-duplicated
// (listVerifiedSpeciesForSpot). Renders nothing until there is one.
export function SpotSpeciesCard({ species }: { species: Taxon[] }) {
  if (species.length === 0) return null;
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-medium">Species</h2>
      <ul className="flex flex-col gap-1 text-sm">
        {species.map((t) => (
          <li key={t.taxonId}>
            {t.commonName && <>{t.commonName} - </>}
            <i>{t.scientificName}</i>
            {t.invasive && <> <InvasiveBadge invasive={t.invasive} /></>}
          </li>
        ))}
      </ul>
    </div>
  );
}
