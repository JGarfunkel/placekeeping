import { db, listingSources, taxonListings } from "@placekeeping/db";
import type { InvasiveInfo, InvasiveSeverity, Taxon } from "@placekeeping/shared-types";
import { STATE_CONFIGS } from "@placekeeping/shared-types";
import { eq } from "drizzle-orm";

// Invasive-species lookup for the species glyph. The listing tables are small
// (a few hundred rows per source), so this reads them whole and matches in
// memory rather than building a per-name SQL join.
//
// A taxon matches a listing by its linked taxon_id, else by name: the
// accepted name, a synonym, or the species-level name (so a listed
// "Phragmites australis ssp. australis" still flags a taxon recorded as
// "Phragmites australis"). Name matching is what keeps listings working for
// taxa created after the loader last ran.

type Listing = {
  taxonId: string | null;
  jurisdiction: string;
  acceptedName: string;
  speciesName: string;
  synonyms: string[];
  regulatoryStatus: string | null;
  tier: string | null;
};

const norm = (s: string) =>
  s.toLowerCase().replace(/\s*×\s*/g, " x ").replace(/\s+/g, " ").trim();

const SEVERITY_RANK: Record<InvasiveSeverity, number> = {
  prohibited: 3,
  regulated: 2,
  listed: 1,
};

function severityOf(l: Listing): InvasiveSeverity {
  if (l.regulatoryStatus === "prohibited") return "prohibited";
  if (l.regulatoryStatus === "regulated") return "regulated";
  return "listed";
}

function toInfo(l: Listing): InvasiveInfo {
  return {
    severity: severityOf(l),
    jurisdiction: l.jurisdiction,
    tier: l.tier,
  };
}

async function loadListings(): Promise<Listing[]> {
  return db
    .select({
      taxonId: taxonListings.taxonId,
      jurisdiction: listingSources.jurisdiction,
      acceptedName: taxonListings.acceptedName,
      speciesName: taxonListings.speciesName,
      synonyms: taxonListings.synonyms,
      regulatoryStatus: taxonListings.regulatoryStatus,
      tier: taxonListings.tier,
    })
    .from(taxonListings)
    .innerJoin(listingSources, eq(taxonListings.sourceId, listingSources.sourceId));
}

/**
 * The listing jurisdiction for a spot's `state` ("ny", or occasionally a full
 * name like "New York"), e.g. "US-NY". Null when the state is missing or
 * unrecognized: a regulatory flag from the wrong state is worse than none, so
 * such spots get no glyph.
 */
export function jurisdictionForState(state: string | null | undefined): string | null {
  const s = state?.trim().toLowerCase();
  if (!s) return null;
  const code = Object.hasOwn(STATE_CONFIGS, s)
    ? s
    : Object.keys(STATE_CONFIGS).find((c) => STATE_CONFIGS[c].name.toLowerCase() === s);
  return code ? `US-${code.toUpperCase()}` : null;
}

export type InvasiveQuery = {
  // Caller's key for the result map (a taxonId, a photoId + name, ...).
  key: string;
  taxonId?: string;
  scientificName: string;
  // The spot's state; only listings for that state's jurisdiction count.
  state: string | null | undefined;
};

/**
 * Invasive info for each query, keyed by `key`; unlisted ones are absent. One
 * read of the listing tables serves the whole batch. When several listings
 * match, the most severe wins.
 */
export async function getInvasiveInfoFor(
  queries: InvasiveQuery[],
): Promise<Map<string, InvasiveInfo>> {
  const out = new Map<string, InvasiveInfo>();
  if (queries.length === 0) return out;
  const listings = await loadListings();
  if (listings.length === 0) return out;

  const byTaxonId = new Map<string, Listing[]>();
  const byName = new Map<string, Listing[]>();
  const add = (m: Map<string, Listing[]>, key: string, l: Listing) => {
    const list = m.get(key);
    if (list) list.push(l);
    else m.set(key, [l]);
  };
  for (const l of listings) {
    if (l.taxonId) add(byTaxonId, l.taxonId, l);
    for (const n of new Set([l.acceptedName, l.speciesName, ...l.synonyms])) {
      add(byName, norm(n), l);
    }
  }

  for (const q of queries) {
    const jurisdiction = jurisdictionForState(q.state);
    if (!jurisdiction) continue;
    const hits = [
      ...(q.taxonId ? (byTaxonId.get(q.taxonId) ?? []) : []),
      ...(byName.get(norm(q.scientificName)) ?? []),
    ].filter((l) => l.jurisdiction === jurisdiction);
    if (hits.length === 0) continue;
    const best = hits.reduce((a, b) =>
      SEVERITY_RANK[severityOf(b)] > SEVERITY_RANK[severityOf(a)] ? b : a,
    );
    out.set(q.key, toInfo(best));
  }
  return out;
}

/** Same taxa with `invasive` filled in (null when not listed) for one state. */
export async function attachInvasive(
  taxaIn: Taxon[],
  state: string | null | undefined,
): Promise<Taxon[]> {
  const info = await getInvasiveInfoFor(
    taxaIn.map((t) => ({ key: t.taxonId, taxonId: t.taxonId, scientificName: t.scientificName, state })),
  );
  return taxaIn.map((t) => ({ ...t, invasive: info.get(t.taxonId) ?? null }));
}
