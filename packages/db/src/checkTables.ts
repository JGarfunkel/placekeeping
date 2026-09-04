import { getTableColumns, getTableName, sql } from "drizzle-orm";
import type { AnyPgTable } from "drizzle-orm/pg-core";
import { checkDatabaseConnection, db } from "./client";
import {
  appSettings,
  events,
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
  events,
];

export interface TableCheckResult {
  table: string;
  ok: boolean;
  error?: string;
  // Columns the schema declares that don't exist on the live table. Only
  // populated when the table itself exists -- if the table is missing
  // entirely, that's reported via `error` instead.
  missingColumns?: string[];
}

export interface TablesCheckReport {
  connectionOk: boolean;
  connectionError?: string;
  tables: TableCheckResult[];
}

// Looks up every column Postgres actually has for the given tables, in one
// round trip, so per-table checks can diff against it instead of each
// issuing their own information_schema query.
async function fetchLiveColumnsByTable(
  tableNames: string[],
): Promise<Map<string, Set<string>>> {
  const result = await db.execute<{ table_name: string; column_name: string }>(sql`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name IN ${tableNames}
  `);

  const byTable = new Map<string, Set<string>>();
  for (const row of result.rows) {
    const columns = byTable.get(row.table_name) ?? new Set<string>();
    columns.add(row.column_name);
    byTable.set(row.table_name, columns);
  }
  return byTable;
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
//
// Missing columns are cross-checked against information_schema up front
// rather than left to surface through the `select()` below, because
// Postgres aborts a query at the first unknown column it hits -- without
// this, a table missing several columns would only ever report one at a
// time, across several rounds of "fix it, rerun, find the next one".
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

  const liveColumnsByTable = await fetchLiveColumnsByTable(
    ALL_TABLES.map((table) => getTableName(table)),
  );

  const tables = await Promise.all(
    ALL_TABLES.map(async (table): Promise<TableCheckResult> => {
      const name = getTableName(table);
      const liveColumns = liveColumnsByTable.get(name);
      const missingColumns = liveColumns
        ? Object.values(getTableColumns(table))
            .map((column) => column.name)
            .filter((columnName) => !liveColumns.has(columnName))
        : [];

      try {
        await db.select().from(table).limit(1);
        if (missingColumns.length > 0) {
          // Shouldn't happen -- select() above names every mapped column,
          // so it should already have thrown. Report it anyway rather than
          // silently trusting a green result.
          return {
            table: name,
            ok: false,
            error: `missing column(s): ${missingColumns.join(", ")}`,
            missingColumns,
          };
        }
        return { table: name, ok: true };
      } catch (error) {
        const message =
          missingColumns.length > 0
            ? `missing column(s): ${missingColumns.join(", ")}`
            : error instanceof Error
              ? error.message
              : String(error);
        return {
          table: name,
          ok: false,
          error: message,
          missingColumns: missingColumns.length > 0 ? missingColumns : undefined,
        };
      }
    }),
  );

  return { connectionOk: true, tables };
}
