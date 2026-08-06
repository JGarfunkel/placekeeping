import { getTableName } from "drizzle-orm";
import type { AnyPgTable } from "drizzle-orm/pg-core";
import { checkDatabaseConnection, db } from "./client";
import {
  appSettings,
  observations,
  parcels,
  siteParcels,
  sites,
  spots,
  stewardMembers,
  stewards,
  subdivisions,
  users,
} from "./schema";

// Explicit list, not reflection over the schema module -- add a table here
// by hand whenever one is added to schema.ts, same "auditable in the code"
// preference as parcels.ts's OWNER_FREE_OUT_FIELDS allowlist.
const ALL_TABLES: AnyPgTable[] = [
  users,
  stewards,
  stewardMembers,
  sites,
  parcels,
  siteParcels,
  spots,
  observations,
  subdivisions,
  appSettings,
];

export interface TableCheckResult {
  table: string;
  ok: boolean;
  error?: string;
}

export interface TablesCheckReport {
  connectionOk: boolean;
  connectionError?: string;
  tables: TableCheckResult[];
}

// Confirms every table Drizzle knows about is actually queryable against
// the live database -- not just that Postgres is reachable
// (checkDatabaseConnection), but that each table and its full column list
// really exist as the schema expects. A migration that silently fails to
// apply leaves the app running against a schema mismatch that nothing else
// catches until a request 500s -- see packages/db/migrations
// 0013_add_territory_boundaries, where drizzle's migrator only compares a
// new migration's journal timestamp against the single most-recently
// applied one, so an out-of-order journal entry gets skipped with no error.
export async function checkAllTablesReadable(): Promise<TablesCheckReport> {
  const connection = await checkDatabaseConnection();
  if (!connection.ok) {
    return {
      connectionOk: false,
      connectionError:
        connection.error instanceof Error
          ? connection.error.message
          : String(connection.error),
      tables: [],
    };
  }

  const tables = await Promise.all(
    ALL_TABLES.map(async (table): Promise<TableCheckResult> => {
      const name = getTableName(table);
      try {
        await db.select().from(table).limit(1);
        return { table: name, ok: true };
      } catch (error) {
        return {
          table: name,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }),
  );

  return { connectionOk: true, tables };
}
