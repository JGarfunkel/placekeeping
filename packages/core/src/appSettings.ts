import { appSettings, db } from "@placekeeping/db";
import { eq } from "drizzle-orm";

// Thrown by assertWritesEnabled (called from the pause gate in
// apps/web/src/lib/apiError.ts) and mapped to a 503 there, same pattern as
// PhotoModerationError.
export class WritesPausedError extends Error {
  constructor() {
    super("Writes are temporarily paused for maintenance.");
    this.name = "WritesPausedError";
  }
}

export interface AppSettings {
  writesPaused: boolean;
  pausedAt: Date | null;
  pausedByUserId: string | null;
}

function toAppSettings(row: {
  writesPaused: boolean;
  pausedAt: Date | null;
  pausedByUserId: string | null;
}): AppSettings {
  return {
    writesPaused: row.writesPaused,
    pausedAt: row.pausedAt,
    pausedByUserId: row.pausedByUserId,
  };
}

// The singleton row (id=1) is created lazily on first read/write rather than
// via seed data, so a freshly-migrated DB never has to remember to insert it.
export async function getAppSettings(): Promise<AppSettings> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.id, 1)).limit(1);
  if (row) return toAppSettings(row);

  const [created] = await db
    .insert(appSettings)
    .values({ id: 1 })
    .onConflictDoNothing()
    .returning();
  if (created) return toAppSettings(created);

  // Lost the race with a concurrent first-read -- the row exists now.
  const [existing] = await db.select().from(appSettings).where(eq(appSettings.id, 1)).limit(1);
  return toAppSettings(existing);
}

export async function setWritesPaused(
  paused: boolean,
  userId: string,
): Promise<AppSettings> {
  await getAppSettings(); // ensures the singleton row exists before updating it

  const [updated] = await db
    .update(appSettings)
    .set({
      writesPaused: paused,
      pausedAt: paused ? new Date() : null,
      pausedByUserId: paused ? userId : null,
    })
    .where(eq(appSettings.id, 1))
    .returning();
  return toAppSettings(updated);
}

// Called from the pause gate in apps/web/src/lib/apiError.ts before any
// non-GET request reaches its handler.
export async function assertWritesEnabled(): Promise<void> {
  const settings = await getAppSettings();
  if (settings.writesPaused) throw new WritesPausedError();
}
