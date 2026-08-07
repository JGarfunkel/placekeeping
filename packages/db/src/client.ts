import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// Lazy: connecting (or even checking DATABASE_URL) at module scope would run
// during `next build`'s page-data-collection pass, which imports every
// route/layout module — including this one, transitively, from the root
// layout — regardless of whether the page ends up statically or dynamically
// rendered. DATABASE_URL is a runtime-only secret (never available at build
// time, same as the other Secret Manager values), so that check has to wait
// until a query actually runs.
let pool: Pool | undefined;
let dbInstance: NodePgDatabase<typeof schema> | undefined;

function getPool(): Pool {
  if (pool) return pool;

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }

  pool = new Pool({ connectionString: process.env.DATABASE_URL });

  // Idle clients emit 'error' when the connection drops unexpectedly (e.g.
  // the database restarting); without a listener, Node treats that as an
  // unhandled exception and crashes the whole server.
  pool.on("error", (err) => {
    console.error("[db] Unexpected error on idle client:", err);
  });

  return pool;
}

function getDb(): NodePgDatabase<typeof schema> {
  if (!dbInstance) {
    dbInstance = drizzle(getPool(), { schema });
  }
  return dbInstance;
}

export const db: NodePgDatabase<typeof schema> = new Proxy(
  {} as NodePgDatabase<typeof schema>,
  {
    get(_target, prop, receiver) {
      return Reflect.get(getDb(), prop, receiver);
    },
  },
);

const CONNECTION_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ETIMEDOUT",
  "ECONNRESET",
]);

/**
 * True for errors that mean "couldn't reach/authenticate to Postgres" (the
 * database is down, unreachable, or misconfigured) as opposed to errors from
 * a query that ran against a working connection.
 */
export function isDatabaseConnectionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const code = (error as { code?: unknown }).code;
  if (typeof code === "string") {
    if (CONNECTION_ERROR_CODES.has(code)) return true;
    if (code.startsWith("08")) return true; // SQLSTATE class 08: Connection Exception
  }

  const cause = (error as { cause?: unknown }).cause;
  if (cause && cause !== error) return isDatabaseConnectionError(cause);

  return false;
}

export async function checkDatabaseConnection(): Promise<
  { ok: true } | { ok: false; error: unknown }
> {
  try {
    await getPool().query("SELECT 1");
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}
