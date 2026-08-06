import { checkAllTablesReadable } from "./checkTables";

async function main() {
  const report = await checkAllTablesReadable();

  if (!report.connectionOk) {
    console.error(`Database unreachable: ${report.connectionError}`);
    process.exit(1);
  }

  console.table(
    report.tables.map((t) => ({ table: t.table, ok: t.ok, error: t.error ?? "" })),
  );

  const failed = report.tables.filter((t) => !t.ok);
  if (failed.length > 0) {
    console.error(
      `${failed.length} of ${report.tables.length} table(s) failed to read. Have you run "npm run db:migrate"?`,
    );
    process.exit(1);
  }

  console.log(`All ${report.tables.length} tables are readable.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
