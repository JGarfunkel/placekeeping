import { parse } from "csv-parse/sync";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import {
  placeAccessValues,
  sitePurposeValues,
  spotPurposeValues,
} from "@placekeeping/shared-types";

// The sheet doesn't distinguish site rows from spot rows (see
// load-places.ts), so purpose values are validated against the union of
// both vocabularies here.
const allPurposeValues = [...sitePurposeValues, ...spotPurposeValues];
import {
  ACRES_TO_SQFT,
  HEADER_MAP,
  type ImportedPlace,
  importedPlaceSchema,
  slugify,
} from "./fields";

const { values } = parseArgs({
  options: {
    "sheet-id": { type: "string" },
    "csv-file": { type: "string" },
    gid: { type: "string", default: "0" },
    out: { type: "string", default: "out/places.json" },
  },
});

async function readCsvText(): Promise<string> {
  if (values["csv-file"]) {
    return readFileSync(values["csv-file"], "utf-8");
  }
  if (values["sheet-id"]) {
    const url = `https://docs.google.com/spreadsheets/d/${values["sheet-id"]}/export?format=csv&gid=${values.gid}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(
        `Failed to fetch sheet (${res.status} ${res.statusText}). ` +
          "Make sure it's shared as \"Anyone with the link can view.\"",
      );
    }
    return res.text();
  }
  throw new Error("Pass either --sheet-id=<id> or --csv-file=<path>");
}

function parseGeo(raw: string | undefined): { latitude: number; longitude: number } | null {
  if (!raw) return null;
  const parts = raw.split(",").map((p) => Number(p.trim()));
  if (parts.length !== 2 || parts.some((n) => Number.isNaN(n))) return null;
  const [latitude, longitude] = parts;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

function nullableText(raw: string | undefined): string | null {
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

function matchEnumValue(
  raw: string | undefined,
  validValues: readonly string[],
  fieldLabel: string,
  unmappedValues: Set<string>,
): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  const slug = slugify(trimmed);
  if ((validValues as readonly string[]).includes(slug)) return slug;
  unmappedValues.add(`${fieldLabel}: "${trimmed}"`);
  return null;
}

async function main() {
  const csvText = await readCsvText();
  const records: Record<string, string>[] = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  });

  if (records.length === 0) {
    console.log("No rows found in the sheet.");
    return;
  }

  const originalHeaders = Object.keys(records[0]);
  const headerToField = new Map<string, string>();
  const unrecognizedColumns: string[] = [];
  for (const header of originalHeaders) {
    const field = HEADER_MAP[slugify(header)];
    if (field) headerToField.set(header, field);
    else unrecognizedColumns.push(header);
  }
  const mappedFields = new Set(headerToField.values());
  const missingColumns = Object.entries(HEADER_MAP)
    .filter(([, field]) => !mappedFields.has(field))
    .map(([slug]) => slug);

  const imported: ImportedPlace[] = [];
  const skipped: { row: number; reason: string }[] = [];
  const unmappedEnumValues = new Set<string>();

  records.forEach((record, index) => {
    const byField: Record<string, string | undefined> = {};
    for (const [header, field] of headerToField) byField[field] = record[header];

    const name = byField.name?.trim();
    if (!name) {
      skipped.push({ row: index + 2, reason: "missing Name" });
      return;
    }

    const geo = parseGeo(byField.geo);
    if (!geo) {
      skipped.push({ row: index + 2, reason: `missing/invalid Geo ("${byField.geo ?? ""}")` });
      return;
    }

    const acres = byField.sizeAcres ? Number(byField.sizeAcres) : NaN;
    const sizeSqft = Number.isNaN(acres) ? null : acres * ACRES_TO_SQFT;

    const hnpMapNumber = byField.hnpMapNumber ? Number.parseInt(byField.hnpMapNumber, 10) : NaN;

    const place: ImportedPlace = {
      name,
      latitude: geo.latitude,
      longitude: geo.longitude,
      state: nullableText(byField.state),
      municipality: nullableText(byField.municipality),
      owner: nullableText(byField.owner),
      stewardName: nullableText(byField.stewardName),
      address: nullableText(byField.address),
      sizeSqft,
      parentName: nullableText(byField.parentName),
      purpose: matchEnumValue(byField.purpose, allPurposeValues, "Purpose", unmappedEnumValues),
      access: matchEnumValue(byField.access, placeAccessValues, "Access", unmappedEnumValues),
      description: nullableText(byField.description),
      needs: nullableText(byField.needs),
      plans: nullableText(byField.plans),
      gisOpenSpace: nullableText(byField.gisOpenSpace),
      gisLandUse: nullableText(byField.gisLandUse),
      website: nullableText(byField.website),
      hnpMapNumber: Number.isNaN(hnpMapNumber) ? null : hnpMapNumber,
    };

    imported.push(importedPlaceSchema.parse(place));
  });

  mkdirSync(dirname(values.out as string), { recursive: true });
  writeFileSync(values.out as string, JSON.stringify(imported, null, 2));

  console.log(`Read ${records.length} row(s), imported ${imported.length}, skipped ${skipped.length}.`);
  if (unrecognizedColumns.length > 0) {
    console.warn(`Unrecognized columns (ignored): ${unrecognizedColumns.join(", ")}`);
  }
  if (missingColumns.length > 0) {
    console.warn(`Expected columns not found in sheet: ${missingColumns.join(", ")}`);
  }
  if (unmappedEnumValues.size > 0) {
    console.warn(`Unrecognized enum values (left blank): ${[...unmappedEnumValues].join(", ")}`);
  }
  for (const s of skipped) {
    console.warn(`Row ${s.row}: skipped (${s.reason})`);
  }
  console.log(`Wrote ${values.out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
