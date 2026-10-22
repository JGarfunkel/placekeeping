// Converts the NY invasive species spreadsheet (tab-separated, saved under
// local/) into the canonical JSON mirror at data/listings/us-ny.json. The DB
// loader reads only that JSON, so it doubles as the interchange format and
// can be reloaded after a schema change. No DB access here.
//
// Name parsing is deliberately conservative: the scientific-name cell holds
// "A", "A (syn. B)", "A : B", infraspecific names, and hybrids. Each cell is
// split into an accepted name plus synonyms; matching against `taxa` happens
// later, in the loader.
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE_CSV = resolve(here, "../../../local/ny-invasive-species-list.csv");
const OUT_JSON = resolve(here, "../data/listings/us-ny.json");

type Listing = {
  commonNames: string[];
  scientificNameRaw: string;
  acceptedName: string;
  synonyms: string[];
  misappliedNames: string[];
  // Accepted name cut back to genus + species, for the species-level fallback
  // when an infraspecific name (ssp./var.) has no match of its own.
  speciesName: string;
  plantType: "terrestrial" | "aquatic" | null;
  ecologicalRank: string | null;
  socioEconomicRank: string | null;
  regulatoryStatus: "prohibited" | "regulated" | null;
  // NY-specific and kept as printed: 1a/1b/1c, 2, 3, 4, or M (medium). Blank
  // means the sheet gave none.
  tier: string | null;
  // Placeholder for regional (e.g. PRISM) classifications, keyed by region id.
  regionClassifiers: Record<string, unknown>;
};

const blank = (s: string | undefined) => {
  const t = (s ?? "").trim();
  return t === "" ? null : t;
};

const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

function speciesOnly(name: string): string {
  // "Genus x epithet" keeps the hybrid marker; ssp./var./subsp. and anything
  // after them is dropped.
  const parts = name.split(" ");
  const out = [parts[0]];
  let i = 1;
  if (parts[i] === "x" || parts[i] === "×") out.push(parts[i++]);
  if (parts[i]) out.push(parts[i]);
  return out.join(" ");
}

function parseScientific(raw: string) {
  const synonyms: string[] = [];
  const misapplied: string[] = [];
  let main = collapse(raw);

  // "A (syn. B)" and "A (syn. B misapplied)"
  main = main.replace(/\(\s*syn\.?\s*([^)]*)\)/gi, (_m, inner: string) => {
    const isMisapplied = /misapplied/i.test(inner);
    const name = collapse(inner.replace(/misapplied/i, ""));
    if (name) (isMisapplied ? misapplied : synonyms).push(name);
    return "";
  });

  // "A : B" -- older synonyms follow the colon.
  const [first, ...rest] = main.split(":");
  main = collapse(first);
  for (const r of rest) {
    const n = collapse(r);
    if (n) synonyms.push(n);
  }

  // Expand abbreviated genera ("R. wichuraiana" -> "Rosa wichuraiana").
  const genus = main.split(" ")[0];
  const expand = (n: string) =>
    /^[A-Z]\.\s/.test(n) && genus.startsWith(n[0])
      ? `${genus} ${n.slice(3)}`
      : n;

  return {
    acceptedName: main,
    synonyms: synonyms.map(expand),
    misappliedNames: misapplied.map(expand),
  };
}

function main() {
  const lines = readFileSync(SOURCE_CSV, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "");
  // Lines 1-2 are the two-row header.
  const rows = lines.slice(2).map((l) => l.split("\t"));

  const listings: Listing[] = [];
  for (const [common, sci, type, eco, soc, reg, tier] of rows) {
    const raw = blank(sci);
    if (!raw) continue;
    const parsed = parseScientific(raw);
    const regLower = blank(reg)?.toLowerCase();
    listings.push({
      commonNames: (common ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      scientificNameRaw: raw,
      ...parsed,
      speciesName: speciesOnly(parsed.acceptedName),
      plantType:
        type?.trim() === "AP"
          ? "aquatic"
          : type?.trim() === "TP"
            ? "terrestrial"
            : null,
      ecologicalRank: blank(eco),
      socioEconomicRank: blank(soc),
      regulatoryStatus:
        regLower === "prohibited" || regLower === "regulated" ? regLower : null,
      tier: blank(tier),
      regionClassifiers: {},
    });
  }

  const out = {
    source: {
      id: "us-ny",
      jurisdiction: "US-NY",
      name: "New York State invasive plant list (terrestrial and aquatic)",
      regulation: "6 NYCRR Part 575",
      retrievedFrom: "local/ny-invasive-species-list.csv",
      generatedAt: new Date().toISOString(),
    },
    listings,
  };

  mkdirSync(dirname(OUT_JSON), { recursive: true });
  writeFileSync(OUT_JSON, JSON.stringify(out, null, 2) + "\n");
  console.log(`Wrote ${listings.length} listings to ${OUT_JSON}`);
}

main();
