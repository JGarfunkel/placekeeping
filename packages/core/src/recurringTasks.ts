import {
  db,
  recurringTaskOccurrences,
  recurringTasks,
  spots,
} from "@placekeeping/db";
import { and, asc, eq, inArray, lt, or, sql } from "drizzle-orm";
import {
  createTaskForSpot,
  IntegrationError,
  listAsanaIdentitiesForUser,
  type BindingScope,
} from "./integrations";

// Recurring tasks for an external task system (Asana). Templates are scoped
// like integration bindings; a scheduler calls runRecurringTasks daily.

export type RecurrenceUnit = "week" | "month" | "year";
export type RecurringTaskRow = typeof recurringTasks.$inferSelect;

const MAX_ATTEMPTS = 5;
const STALE_PROCESSING_MS = 15 * 60 * 1000;
// Safety cap on how many due dates one run will walk for one template.
const MAX_CATCH_UP = 24;

// ---- dates (all "YYYY-MM-DD" strings, computed in UTC) -----------------------

function parseDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(value: string, days: number): string {
  const d = parseDate(value);
  d.setUTCDate(d.getUTCDate() + days);
  return formatDate(d);
}

// anchor + n units, clamping to the end of a shorter month (Jan 31 + 1 month
// is Feb 28/29). Always computed from the anchor so clamping never drifts.
export function addUnits(anchor: string, unit: RecurrenceUnit, n: number): string {
  if (unit === "week") return addDays(anchor, 7 * n);
  const months = unit === "year" ? 12 * n : n;
  const d = parseDate(anchor);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return formatDate(d);
}

export function todayUtc(now = new Date()): string {
  return formatDate(now);
}

// ---- templates -----------------------------------------------------------------

function scopeWhere(scope: BindingScope) {
  return "stewardId" in scope
    ? eq(recurringTasks.stewardId, scope.stewardId)
    : "siteId" in scope
      ? eq(recurringTasks.siteId, scope.siteId)
      : eq(recurringTasks.spotId, scope.spotId);
}

export function recurringTaskScope(row: RecurringTaskRow): BindingScope {
  if (row.stewardId) return { stewardId: row.stewardId };
  if (row.siteId != null) return { siteId: row.siteId };
  return { spotId: row.spotId as number };
}

export async function getRecurringTask(id: string) {
  const [row] = await db
    .select()
    .from(recurringTasks)
    .where(eq(recurringTasks.id, id))
    .limit(1);
  return row ?? null;
}

export async function listRecurringTasks(scope: BindingScope) {
  return db
    .select()
    .from(recurringTasks)
    .where(and(scopeWhere(scope), eq(recurringTasks.system, "asana")))
    .orderBy(asc(recurringTasks.nextDueOn));
}

export async function createRecurringTask(input: {
  scope: BindingScope;
  userId: string;
  title: string;
  notes: string;
  unit: RecurrenceUnit;
  interval: number;
  firstDueOn: string;
  leadDays: number;
}) {
  // Occurrences are created with this user's token, so they need one.
  const identities = await listAsanaIdentitiesForUser(input.userId);
  if (!identities.some((i) => i.status === "active")) {
    throw new IntegrationError(403, "Connect your Asana account first.");
  }
  const [row] = await db
    .insert(recurringTasks)
    .values({
      stewardId: "stewardId" in input.scope ? input.scope.stewardId : null,
      siteId: "siteId" in input.scope ? input.scope.siteId : null,
      spotId: "spotId" in input.scope ? input.scope.spotId : null,
      system: "asana",
      title: input.title,
      notes: input.notes,
      unit: input.unit,
      interval: input.interval,
      anchorDate: input.firstDueOn,
      leadDays: input.leadDays,
      nextDueOn: input.firstDueOn,
      configuredBy: input.userId,
    })
    .returning();
  return row;
}

// Resuming hands the schedule to the resuming user, since the previous owner's
// token is usually why it paused.
export async function setRecurringTaskStatus(
  id: string,
  status: "active" | "paused",
  userId: string,
) {
  if (status === "active") {
    const identities = await listAsanaIdentitiesForUser(userId);
    if (!identities.some((i) => i.status === "active")) {
      throw new IntegrationError(403, "Connect your Asana account first.");
    }
  }
  await db
    .update(recurringTasks)
    .set({
      status,
      pausedReason: null,
      ...(status === "active" ? { configuredBy: userId } : {}),
      updatedAt: new Date(),
    })
    .where(eq(recurringTasks.id, id));
}

export async function deleteRecurringTask(id: string) {
  await db.delete(recurringTasks).where(eq(recurringTasks.id, id));
}

// ---- scheduler -----------------------------------------------------------------

async function spotIdsInScope(row: RecurringTaskRow): Promise<number[]> {
  const where = row.stewardId
    ? eq(spots.stewardId, row.stewardId)
    : row.siteId != null
      ? eq(spots.siteId, row.siteId)
      : eq(spots.spotId, row.spotId as number);
  const found = await db.select({ spotId: spots.spotId }).from(spots).where(where);
  return found.map((s) => s.spotId);
}

// Step 1: for every active template whose lead window has opened, record a
// pending occurrence per spot, then advance the template to its next due date.
// Past-due dates (e.g. the scheduler was down) are skipped, not back-filled.
async function generateOccurrences(today: string) {
  const due = await db
    .select()
    .from(recurringTasks)
    .where(
      and(
        eq(recurringTasks.status, "active"),
        sql`${recurringTasks.nextDueOn} - ${recurringTasks.leadDays} <= ${today}::date`,
      ),
    );
  let generated = 0;
  for (const row of due) {
    let nextDueOn = row.nextDueOn;
    let count = row.occurrenceCount;
    const spotIds = await spotIdsInScope(row);
    for (
      let i = 0;
      i < MAX_CATCH_UP && addDays(nextDueOn, -row.leadDays) <= today;
      i++
    ) {
      if (nextDueOn >= today && spotIds.length > 0) {
        const inserted = await db
          .insert(recurringTaskOccurrences)
          .values(
            spotIds.map((spotId) => ({
              recurringTaskId: row.id,
              spotId,
              dueOn: nextDueOn,
            })),
          )
          .onConflictDoNothing()
          .returning({ id: recurringTaskOccurrences.id });
        generated += inserted.length;
      }
      count += 1;
      nextDueOn = addUnits(row.anchorDate, row.unit as RecurrenceUnit, row.interval * count);
    }
    await db
      .update(recurringTasks)
      .set({ nextDueOn, occurrenceCount: count, updatedAt: new Date() })
      .where(eq(recurringTasks.id, row.id));
  }
  return generated;
}

function appBaseUrl() {
  return process.env.APP_BASE_URL ?? "http://localhost:3000";
}

// Step 2: create the Asana task for each pending (or retryable) occurrence.
// Each occurrence is claimed with a conditional update first, so overlapping
// runs cannot both create it.
async function processOccurrences() {
  const staleBefore = new Date(Date.now() - STALE_PROCESSING_MS);
  const candidates = await db
    .select({
      occurrence: recurringTaskOccurrences,
      template: recurringTasks,
      spotName: spots.name,
    })
    .from(recurringTaskOccurrences)
    .innerJoin(
      recurringTasks,
      eq(recurringTasks.id, recurringTaskOccurrences.recurringTaskId),
    )
    .innerJoin(spots, eq(spots.spotId, recurringTaskOccurrences.spotId))
    .where(
      and(
        eq(recurringTasks.status, "active"),
        lt(recurringTaskOccurrences.attempts, MAX_ATTEMPTS),
        or(
          inArray(recurringTaskOccurrences.status, ["pending", "failed"]),
          and(
            eq(recurringTaskOccurrences.status, "processing"),
            lt(recurringTaskOccurrences.updatedAt, staleBefore),
          ),
        ),
      ),
    )
    .orderBy(asc(recurringTaskOccurrences.dueOn))
    .limit(200);

  const result = { created: 0, failed: 0, skipped: 0 };
  for (const { occurrence, template, spotName } of candidates) {
    const [claimed] = await db
      .update(recurringTaskOccurrences)
      .set({
        status: "processing",
        attempts: sql`${recurringTaskOccurrences.attempts} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(recurringTaskOccurrences.id, occurrence.id),
          eq(recurringTaskOccurrences.status, occurrence.status),
          eq(recurringTaskOccurrences.attempts, occurrence.attempts),
        ),
      )
      .returning({ id: recurringTaskOccurrences.id });
    if (!claimed) continue;

    const finish = (
      status: "created" | "failed" | "skipped",
      extra: { lastError?: string; externalLinkId?: string } = {},
    ) =>
      db
        .update(recurringTaskOccurrences)
        .set({ status, updatedAt: new Date(), ...extra })
        .where(eq(recurringTaskOccurrences.id, occurrence.id));

    if (!template.configuredBy) {
      await pauseTemplate(template.id, "The user who set this up is gone.");
      await finish("failed", { lastError: "No owner" });
      result.failed++;
      continue;
    }
    try {
      const link = await createTaskForSpot({
        userId: template.configuredBy,
        spotId: occurrence.spotId,
        observationId: null,
        name: template.spotId != null ? template.title : `${template.title}: ${spotName}`,
        notes: [
          template.notes,
          "",
          `Spot: ${spotName}`,
          `Link: ${appBaseUrl()}/spots/${occurrence.spotId}`,
          "(Created automatically by a Placekeeping recurring task.)",
        ]
          .join("\n")
          .trim(),
        dueOn: occurrence.dueOn,
        photoUrl: null,
      });
      await finish("created", { externalLinkId: link.id });
      result.created++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (err instanceof IntegrationError && err.status === 400) {
        // The spot has no Asana binding: nothing to retry.
        await finish("skipped", { lastError: message });
        result.skipped++;
      } else {
        if (err instanceof IntegrationError && (err.status === 401 || err.status === 403)) {
          await pauseTemplate(template.id, message);
        }
        await finish("failed", { lastError: message });
        result.failed++;
      }
    }
  }
  return result;
}

async function pauseTemplate(id: string, reason: string) {
  await db
    .update(recurringTasks)
    .set({ status: "paused", pausedReason: reason, updatedAt: new Date() })
    .where(eq(recurringTasks.id, id));
}

/** One scheduler tick. Safe to run repeatedly. */
export async function runRecurringTasks(now = new Date()) {
  const generated = await generateOccurrences(todayUtc(now));
  const processed = await processOccurrences();
  return { generated, ...processed };
}
