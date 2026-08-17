import { db, events, users } from "@placekeeping/db";
import { and, desc, eq, sql } from "drizzle-orm";

export type EventAction = "create" | "update" | "delete";

export type EventChanges = Record<string, { from: unknown; to: unknown }>;

// Either the module-level `db` or a `db.transaction(async (tx) => ...)`
// callback's `tx` -- both expose the same `.insert()` builder, so a caller
// already inside a transaction can pass `tx` to keep the event write atomic
// with the row change it's describing.
type DbOrTx = typeof db;

export interface LogEventInput {
  entityType: string;
  entityId: string | number;
  action: EventAction;
  userId: string | null;
  changes?: EventChanges | null;
}

// The single write path for the events audit log -- called from each
// entity's create/update/delete function in this package (spots, sites,
// observations, stewards, stewardMembers, users, appSettings). Never
// throws on its own SQL errors bubbling up: a logging failure should fail
// the same way the write it's describing would.
export async function logEvent(
  input: LogEventInput,
  dbOrTx: DbOrTx = db,
): Promise<void> {
  await dbOrTx.insert(events).values({
    entityType: input.entityType,
    entityId: String(input.entityId),
    action: input.action,
    userId: input.userId,
    changes: input.changes ?? null,
  });
}

// Builds the `changes` payload for a create/delete event from a single
// row snapshot -- every present field becomes {from: null, to: value} (create)
// or {from: value, to: null} (delete), so the UI can render create/update/
// delete with the same "field: from -> to" shape.
export function snapshotToChanges(
  snapshot: Record<string, unknown>,
  direction: "create" | "delete",
): EventChanges {
  const changes: EventChanges = {};
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) continue;
    changes[key] = direction === "create" ? { from: null, to: value } : { from: value, to: null };
  }
  return changes;
}

// Builds the `changes` payload for an update event: for every key present
// (and not undefined) on `input` -- the caller's intended set of edits --
// compares the pre-update value to the post-update value and keeps only
// the ones that actually changed. Using `after` (the saved row) rather
// than `input` for the "to" value catches server-side transformations
// (e.g. a recomputed slug) that the raw input wouldn't show.
export function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  input: Record<string, unknown>,
): EventChanges | null {
  const changes: EventChanges = {};
  for (const key of Object.keys(input)) {
    if (input[key] === undefined) continue;
    const b = before[key] ?? null;
    const a = after[key] ?? null;
    if (JSON.stringify(b) !== JSON.stringify(a)) {
      changes[key] = { from: b, to: a };
    }
  }
  return Object.keys(changes).length > 0 ? changes : null;
}

export interface EventListItem {
  eventId: string;
  entityType: string;
  entityId: string;
  action: EventAction;
  userId: string | null;
  username: string | null;
  changes: EventChanges | null;
  createdAt: string;
}

export interface ListEventsFilter {
  entityType?: string;
  action?: EventAction;
  userId?: string;
}

function eventFilterConditions(filter: ListEventsFilter) {
  const conditions = [];
  if (filter.entityType) conditions.push(eq(events.entityType, filter.entityType));
  if (filter.action) conditions.push(eq(events.action, filter.action));
  if (filter.userId) conditions.push(eq(events.userId, filter.userId));
  return conditions;
}

// Backs the admin event log (apps/web /admin/events).
export async function listEvents(
  filter: ListEventsFilter = {},
  limit = 50,
  offset = 0,
): Promise<EventListItem[]> {
  const conditions = eventFilterConditions(filter);
  const rows = await db
    .select({
      eventId: events.eventId,
      entityType: events.entityType,
      entityId: events.entityId,
      action: events.action,
      userId: events.userId,
      username: users.username,
      changes: events.changes,
      createdAt: events.createdAt,
    })
    .from(events)
    .leftJoin(users, eq(users.userId, events.userId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(events.createdAt))
    .limit(limit)
    .offset(offset);

  return rows.map((r) => ({
    ...r,
    action: r.action as EventAction,
    changes: r.changes as EventChanges | null,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function countEvents(filter: ListEventsFilter = {}): Promise<number> {
  const conditions = eventFilterConditions(filter);
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(events)
    .where(conditions.length ? and(...conditions) : undefined);
  return Number(row?.count ?? 0);
}

// Every entity_type value events are ever logged under -- drives the
// filter dropdown in the admin UI. Kept as a plain list (not a DB enum,
// same convention as vegetation/weedLevel, see schema.ts) since it's just
// for populating a <select>, not for constraining what's written.
export const EVENT_ENTITY_TYPES = [
  "spot",
  "site",
  "observation",
  "steward",
  "steward_member",
  "user",
  "app_settings",
] as const;
