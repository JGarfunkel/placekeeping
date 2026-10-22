// Loads a listing JSON file (data/listings/<source>.json, written by
// generateInvasiveListingJson.ts) into listing_sources + taxon_listings, then
// links each listing to an existing `taxa` row by name. Reloading replaces
// that source's listings wholesale, so the JSON stays the source of truth.
//
// Matching is by name only, against taxa already in the DB -- no GBIF calls.
// Unmatched listings keep a null taxon_id; they still apply later, because
// readers can also join on names (synonyms and species-level included).
//
// Usage: npm run load-invasive-listings -- [us-ny]
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { db } from "./client";
import { listingSources, taxa, taxonListings } from "./schema";

const here = dirname(fileURLToPath(import.meta.url));

type ListingJson = {
  source: {
    id: string;
    jurisdiction: string;
    name: string;
    regulation?: string;
    generatedAt?: string;
  };
  listings: {
    commonNames: string[];
    scientificNameRaw: string;
    acceptedName: string;
    synonyms: string[];
    misappliedNames: string[];
    speciesName: string;
    plantType: string | null;
    ecologicalRank: string | null;
    socioEconomicRank: string | null;
    regulatoryStatus: string | null;
    tier: string | null;
    regionClassifiers: Record<string, unknown>;
  }[];
};

// Lowercase, one spacing, one hybrid marker.
const norm = (s: string) =>
  s.toLowerCase().replace(/\s*×\s*/g, " x ").replace(/\s+/g, " ").trim();

const speciesOf = (name: string) => {
  const p = norm(name).split(" ");
  const out = [p[0]];
  let i = 1;
  if (p[i] === "x") out.push(p[i++]);
  if (p[i]) out.push(p[i]);
  return out.join(" ");
};

async function main() {
  const sourceId = process.argv[2] ?? "us-ny";
  const file = resolve(here, `../data/listings/${sourceId}.json`);
  const data = JSON.parse(readFileSync(file, "utf8")) as ListingJson;

  const taxonRows = await db
    .select({ taxonId: taxa.taxonId, name: taxa.scientificName })
    .from(taxa);
  const byName = new Map<string, string>();
  for (const t of taxonRows) {
    const key = norm(t.name);
    if (!byName.has(key)) byName.set(key, t.taxonId);
  }

  const rows = data.listings.map((l) => {
    let taxonId: string | null = null;
    let matchRank: string | null = null;
    const tryName = (name: string, rank: string) => {
      if (taxonId) return;
      const hit = byName.get(norm(name));
      if (hit) {
        taxonId = hit;
        matchRank = rank;
      }
    };
    tryName(l.acceptedName, "exact");
    for (const s of l.synonyms) tryName(s, "synonym");
    tryName(l.speciesName, "species");
    for (const s of l.synonyms) tryName(speciesOf(s), "species");
    return {
      sourceId: data.source.id,
      taxonId,
      matchRank,
      scientificNameRaw: l.scientificNameRaw,
      acceptedName: l.acceptedName,
      speciesName: l.speciesName,
      synonyms: l.synonyms,
      misappliedNames: l.misappliedNames,
      commonNames: l.commonNames,
      plantType: l.plantType,
      ecologicalRank: l.ecologicalRank,
      socioEconomicRank: l.socioEconomicRank,
      regulatoryStatus: l.regulatoryStatus,
      tier: l.tier,
      regionClassifiers: l.regionClassifiers,
    };
  });

  await db.transaction(async (tx) => {
    await tx
      .insert(listingSources)
      .values({
        sourceId: data.source.id,
        jurisdiction: data.source.jurisdiction,
        name: data.source.name,
        regulation: data.source.regulation ?? null,
        generatedAt: data.source.generatedAt
          ? new Date(data.source.generatedAt)
          : null,
      })
      .onConflictDoUpdate({
        target: listingSources.sourceId,
        set: {
          jurisdiction: data.source.jurisdiction,
          name: data.source.name,
          regulation: data.source.regulation ?? null,
          generatedAt: data.source.generatedAt
            ? new Date(data.source.generatedAt)
            : null,
          loadedAt: new Date(),
        },
      });
    await tx
      .delete(taxonListings)
      .where(eq(taxonListings.sourceId, data.source.id));
    for (let i = 0; i < rows.length; i += 100) {
      await tx.insert(taxonListings).values(rows.slice(i, i + 100));
    }
  });

  const matched = rows.filter((r) => r.taxonId).length;
  console.log(
    `Loaded ${rows.length} listings for ${data.source.id}; ${matched} linked to existing taxa, ${rows.length - matched} unmatched.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
