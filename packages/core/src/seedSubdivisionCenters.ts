// One-off/rerunnable import: seeds `subdivisions` with a centroid + zoom for
// every county and locality (city/town/village/CDP) in a state, from the US
// Census Gazetteer files -- static, nationwide, no GIS service involved. That
// lets resolveMunicipality answer from our own DB (see
// resolveFromStoredBoundaries in territory.ts) instead of hitting ArcGIS on
// the request path.
//
// Usage: npm run db:seed-subdivision-centers [-- --state ny] [-- --dir <path>]
//   --state  USPS code, default "ny"
//   --dry-run  parse and print a summary/sample; write nothing
//   --dir    folder holding already-extracted Gaz_{counties,cousubs,place}
//            _national.txt files; omitted -> downloaded (and unzipped) into
//            the OS temp dir.
//
// What it writes: level-2 rows at the same canonical path a GIS resolve would
// use ("us/ny/mount-kisco-town"), with centerLat/centerLng/zoom, type,
// county, externalId and source "census-gazetteer". It never touches
// spotCounts, and never overwrites a row that already has a center (a
// GIS-resolved row with real geometry is better than a centroid) -- it only
// inserts new rows and fills in count-only placeholders. No `geom` is stored,
// so nothing here replaces a real boundary; a later page visit that GIS-
// resolves a row still upserts the geometry over it.
//
// The centroid is the Census "internal point" (INTPTLAT/INTPTLONG). Zoom is
// approximated from ALAND+AWATER: span ~ 1.5 * sqrt(area) in degrees, run
// through the same formula as boundsFromGeometry. Real bounding boxes are
// not square, so expect results within about +/-1 zoom of a GIS-derived row.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import { db, subdivisions } from "@placekeeping/db";
import { isNull, sql } from "drizzle-orm";
import {
  countyPathSegment,
  normalizeCountyName,
  slugifyMuniName,
  zoomForSpanDegrees,
  type MunicipalityType,
} from "./territory";

const GAZETTEER_YEAR = 2024;
const GAZETTEER_BASE = `https://www2.census.gov/geo/docs/maps-data/data/gazetteer/${GAZETTEER_YEAR}_Gazetteer`;
const FILES = ["counties", "cousubs", "place"] as const;
type FileKind = (typeof FILES)[number];

const METERS_PER_DEGREE = 111_320;
// Real extents are bigger than a square of the same area (irregular shapes,
// long thin towns) -- calibrated against existing GIS-derived zooms.
const SPAN_FACTOR = 1.5;

// ---- Download/unzip (single-file zips only, no dependency) -----------------

function unzipSingleFile(zip: Buffer): Buffer {
  // Walk back from the end to the End Of Central Directory record.
  let eocd = zip.length - 22;
  while (eocd >= 0 && zip.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error("Not a zip file (no end-of-central-directory)");
  const cd = zip.readUInt32LE(eocd + 16);
  if (zip.readUInt32LE(cd) !== 0x02014b50) throw new Error("Corrupt zip central directory");
  const method = zip.readUInt16LE(cd + 10);
  const compressedSize = zip.readUInt32LE(cd + 20);
  const localHeader = zip.readUInt32LE(cd + 42);
  const nameLen = zip.readUInt16LE(localHeader + 26);
  const extraLen = zip.readUInt16LE(localHeader + 28);
  const start = localHeader + 30 + nameLen + extraLen;
  const data = zip.subarray(start, start + compressedSize);
  if (method === 0) return data;
  if (method === 8) return inflateRawSync(data);
  throw new Error(`Unsupported zip compression method ${method}`);
}

async function loadFile(kind: FileKind, dir: string | undefined): Promise<string> {
  const name = `${GAZETTEER_YEAR}_Gaz_${kind}_national`;
  if (dir) return readFile(path.join(dir, `${name}.txt`), "utf8");

  const cacheDir = path.join(tmpdir(), "placekeeping-gazetteer");
  const cached = path.join(cacheDir, `${name}.txt`);
  if (existsSync(cached)) return readFile(cached, "utf8");

  const url = `${GAZETTEER_BASE}/${name}.zip`;
  console.log(`Downloading ${url}`);
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`);
  const text = unzipSingleFile(Buffer.from(await response.arrayBuffer())).toString("utf8");
  await mkdir(cacheDir, { recursive: true });
  await writeFile(cached, text);
  return text;
}

// ---- Parsing ----------------------------------------------------------------

type GazRow = Record<string, string>;

function parseTsv(text: string): GazRow[] {
  const [header, ...lines] = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  const columns = header.split("\t").map((c) => c.trim());
  return lines.map((line) => {
    const cells = line.split("\t");
    return Object.fromEntries(columns.map((c, i) => [c, (cells[i] ?? "").trim()]));
  });
}

// "Mount Kisco village" -> { name: "Mount Kisco", type: "village" }. Names
// whose suffix isn't a type the app resolves (e.g. "town" is fine, but
// "municipality" or "UT") are dropped.
const SUFFIX_TYPES: Record<string, MunicipalityType> = {
  city: "city",
  town: "town",
  village: "village",
  borough: "borough",
  township: "township",
  cdp: "cdp",
};

function splitName(full: string): { name: string; type: MunicipalityType } | null {
  const match = /^(.*\S)\s+(\S+)$/.exec(full);
  if (!match) return null;
  const type = SUFFIX_TYPES[match[2].toLowerCase()];
  return type ? { name: match[1], type } : null;
}

// Census ANSICODE is the GNIS feature ID, zero-padded; the app's other
// sources store it unpadded (e.g. Westchester County "974157").
const gnisId = (ansi: string): string => String(Number(ansi));

interface SeedRow {
  level: 2;
  path: string;
  name: string;
  county: string | null;
  type: MunicipalityType;
  externalId: string | null;
  centerLat: string;
  centerLng: string;
  zoom: number;
}

function zoomFor(row: GazRow): number {
  const areaM2 = Number(row.ALAND) + Number(row.AWATER);
  const spanDegrees = (SPAN_FACTOR * Math.sqrt(areaM2)) / METERS_PER_DEGREE;
  return zoomForSpanDegrees(spanDegrees);
}

function toSeedRow(
  statePath: string,
  row: GazRow,
  name: string,
  type: MunicipalityType,
  county: string | null,
  externalId: string,
): SeedRow | null {
  const lat = Number(row.INTPTLAT);
  const lng = Number(row.INTPTLONG);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const segment = type === "county" ? countyPathSegment(name) : `${slugifyMuniName(name)}-${type}`;
  return {
    level: 2,
    path: `${statePath}/${segment}`,
    name,
    county,
    type,
    externalId,
    centerLat: String(lat),
    centerLng: String(lng),
    zoom: zoomFor(row),
  };
}

function buildRows(
  usps: string,
  counties: GazRow[],
  cousubs: GazRow[],
  places: GazRow[],
): SeedRow[] {
  const statePath = `us/${usps.toLowerCase()}`;
  const byPath = new Map<string, SeedRow>();
  const add = (row: SeedRow | null) => {
    if (row) byPath.set(row.path, row);
  };

  const countyNameByFips = new Map<string, string>();
  for (const row of counties.filter((r) => r.USPS === usps)) {
    const name = normalizeCountyName(row.NAME);
    countyNameByFips.set(row.GEOID, name);
    add(toSeedRow(statePath, row, name, "county", null, gnisId(row.ANSICODE)));
  }

  // County subdivisions carry their county in the GEOID (state 2 + county 3
  // + subdivision 5 digits); places don't, so they get county: null -- same
  // as a ZIP/CDP resolved through GIS.
  for (const row of cousubs.filter((r) => r.USPS === usps)) {
    const parsed = splitName(row.NAME);
    // NYC boroughs are counties here, not municipalities of their own.
    if (!parsed || (usps === "NY" && parsed.type === "borough")) continue;
    const county = countyNameByFips.get(row.GEOID.slice(0, 5)) ?? null;
    add(toSeedRow(statePath, row, parsed.name, parsed.type, county, gnisId(row.ANSICODE)));
  }

  // Places last: for a city that appears in both files (Yonkers) the place
  // row wins, as the GIS city layer is place-based.
  for (const row of places.filter((r) => r.USPS === usps)) {
    const parsed = splitName(row.NAME);
    if (!parsed) continue;
    // CDPs keep the full GEOID as externalId, matching findCdpWinner.
    const externalId = parsed.type === "cdp" ? row.GEOID : gnisId(row.ANSICODE);
    add(toSeedRow(statePath, row, parsed.name, parsed.type, null, externalId));
  }

  return Array.from(byPath.values());
}

// Value the INSERT would have written for a column, for the conflict update.
const sqlExcluded = (column: string) => sql.raw(`excluded."${column}"`);

// ---- Main -------------------------------------------------------------------

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const usps = (argValue("--state") ?? "ny").toUpperCase();
  const dir = argValue("--dir");

  const [counties, cousubs, places] = await Promise.all(
    FILES.map(async (kind) => parseTsv(await loadFile(kind, dir))),
  );
  const rows = buildRows(usps, counties, cousubs, places);
  if (rows.length === 0) throw new Error(`No Gazetteer rows found for state ${usps}`);
  if (process.argv.includes("--dry-run")) {
    const byType = new Map<string, number>();
    for (const r of rows) byType.set(r.type, (byType.get(r.type) ?? 0) + 1);
    console.log(`Dry run: ${rows.length} row(s)`, Object.fromEntries(byType));
    console.table(
      rows
        .filter((r) => /kisco|new-castle|westchester|chappaqua|yonkers|bronx/.test(r.path))
        .map(({ path, name, county, type, externalId, centerLat, centerLng, zoom }) => ({
          path, name, county, type, externalId, centerLat, centerLng, zoom,
        })),
    );
    process.exit(0);
  }
  console.log(`Seeding ${rows.length} ${usps} subdivision row(s)...`);

  const BATCH = 200;
  for (let i = 0; i < rows.length; i += BATCH) {
    await db
      .insert(subdivisions)
      .values(rows.slice(i, i + BATCH).map((r) => ({ ...r, source: "census-gazetteer", fetchedAt: new Date() })))
      .onConflictDoUpdate({
        target: subdivisions.path,
        // Only fills rows that have no center yet (count-only placeholders)
        // -- a row that's already resolved is left exactly as it is.
        set: {
          level: 2,
          name: sqlExcluded("name"),
          county: sqlExcluded("county"),
          type: sqlExcluded("type"),
          externalId: sqlExcluded("external_id"),
          centerLat: sqlExcluded("center_lat"),
          centerLng: sqlExcluded("center_lng"),
          zoom: sqlExcluded("zoom"),
          source: sqlExcluded("source"),
          fetchedAt: sqlExcluded("fetched_at"),
        },
        setWhere: isNull(subdivisions.centerLat),
      });
    console.log(`  ${Math.min(i + BATCH, rows.length)}/${rows.length}`);
  }

  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
