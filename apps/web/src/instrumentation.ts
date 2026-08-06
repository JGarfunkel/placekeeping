export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { checkAllTablesReadable } = await import("@placekeeping/db");
  const report = await checkAllTablesReadable();

  if (!report.connectionOk) {
    console.error(
      "[startup] WARNING: could not connect to the database. The server will " +
        "start anyway, but pages and requests that need the database will fail " +
        `until connectivity is restored.\n[startup] ${report.connectionError}`,
    );
    return;
  }

  const failed = report.tables.filter((t) => !t.ok);
  if (failed.length > 0) {
    console.error(
      "[startup] WARNING: connected to the database, but " +
        `${failed.length} of ${report.tables.length} table(s) aren't readable ` +
        "as the schema expects -- a migration likely hasn't been applied. Run " +
        `"npm run db:migrate" (or "npm run db:check" for details). The server ` +
        "will start anyway, but requests touching the affected table(s) will fail.\n" +
        failed.map((t) => `[startup]   ${t.table}: ${t.error}`).join("\n"),
    );
    return;
  }

  console.log(`[startup] Database OK -- all ${report.tables.length} tables readable.`);
}
