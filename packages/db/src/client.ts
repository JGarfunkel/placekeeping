import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Idle clients emit 'error' when the connection drops unexpectedly (e.g. the
// database restarting); without a listener, Node treats that as an unhandled
// exception and crashes the whole server.
pool.on("error", (err) => {
  console.error("[db] Unexpected error on idle client:", err);
});

export const db = drizzle(pool, { schema });

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
    await pool.query("SELECT 1");
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}
