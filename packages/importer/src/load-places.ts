import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { db, spots } from "@placekeeping/db";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { importedPlaceSchema } from "./fields";

const { values } = parseArgs({
  options: {
    file: { type: "string" },
  },
});

async function main() {
  if (!values.file) throw new Error("Pass --file=<path to JSON produced by fetch-sheet>");

  const raw = JSON.parse(readFileSync(values.file, "utf-8"));
  const rows = z.array(importedPlaceSchema).parse(raw);
  if (rows.length === 0) {
    console.log("No rows to import.");
    return;
  }

  // A "parent" column used to link two spot rows via parentPlaceId
  // (places.parent_place_id). That column is gone — a parent row now
  // belongs in `sites`, not `spots` — so site-linking on import is
  // deferred until sites has its own creation path. See
  // local/place-split.md. Flag any rows that still carry a parent so
  // they aren't silently dropped.
  const parented = rows.filter((row) => row.parentName);
  if (parented.length > 0) {
    console.warn(
      `${parented.length} row(s) have a "parent" column set; parent linking ` +
        `is not implemented yet post-split and will be ignored:\n` +
        parented.map((row) => `"${row.name}" -> parent "${row.parentName}"`).join("\n"),
    );
  }

  // "owner" now belongs on sites, not spots -- like parentName above, site
  // linking on import isn't wired up yet, so flag rather than silently drop.
  const owned = rows.filter((row) => row.owner);
  if (owned.length > 0) {
    console.warn(
      `${owned.length} row(s) have an "owner" column set; owner now lives ` +
        `on sites and site import isn't implemented yet, so it will be ` +
        `ignored:\n` +
        owned.map((row) => `"${row.name}" -> owner "${row.owner}"`).join("\n"),
    );
  }

  const inserted = await db
    .insert(spots)
    .values(
      rows.map((row) => ({
        name: row.name,
        location: sql`ST_SetSRID(ST_MakePoint(${row.longitude}, ${row.latitude}), 4326)::geography`,
        state: row.state,
        municipality: row.municipality,
        stewardName: row.stewardName,
        address: row.address,
        sizeSqft: row.sizeSqft !== null ? String(row.sizeSqft) : undefined,
        purpose: row.purpose as (typeof spots.$inferInsert)["purpose"],
        access: row.access as (typeof spots.$inferInsert)["access"],
        description: row.description,
        needs: row.needs,
        plans: row.plans,
        website: row.website,
      })),
    )
    .returning({ spotId: spots.spotId, name: spots.name });

  console.log(`Inserted ${inserted.length} spot(s).`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
