import { db } from "@placekeeping/db";
import { sql } from "drizzle-orm";
import { isSuspended, isTaskMember, type AuthContext } from "./auth";
import type { TaskStatus } from "./taskTypes";

// Events and tasks for a territory page (a state, county, city, ...). Nothing
// is attached to the territory itself: this aggregates what stewards have
// scheduled at the spots and sites inside it. "Inside" uses the same
// circle the territory page's map uses (a radius around the territory's
// centre), so the lists match what the visitor sees on the map. A site
// counts if any of its spots is inside.

export interface TerritoryArea {
  lat: number;
  lng: number;
  radiusMi: number;
}

// Where an activity item happens: enough for the web layer to build a link.
export interface TerritoryPlaceRef {
  kind: "spot" | "site";
  name: string;
  spotId: number | null;
  slugState: string | null;
  slugLocality: string | null;
  slug: string | null;
  siteId: number | null;
}

export interface TerritoryEvent {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  timeZone: string;
  eventType: string;
  place: TerritoryPlaceRef;
}

export interface TerritoryTask {
  id: string;
  title: string;
  status: TaskStatus;
  dueOn: string | null;
  assigneeName: string | null;
  place: TerritoryPlaceRef;
}

function origin(area: TerritoryArea) {
  return sql`ST_MakePoint(${area.lng}, ${area.lat})::geography`;
}

function within(column: ReturnType<typeof sql.raw>, area: TerritoryArea) {
  return sql`ST_DWithin(${column}, ${origin(area)}, ${area.radiusMi * 1609.344})`;
}

// Spots inside the area, and the sites that contain at least one of them.
function areaSpotIds(area: TerritoryArea) {
  return sql`(SELECT a.spot_id FROM spots a WHERE ${within(sql.raw("a.location"), area)})`;
}
function areaSiteIds(area: TerritoryArea) {
  return sql`(SELECT DISTINCT a.site_id FROM spots a WHERE a.site_id IS NOT NULL AND ${within(sql.raw("a.location"), area)})`;
}

/**
 * Upcoming events at spots and sites in the area. Public events show to
 * everyone and members-only events to signed-in users; managers-only events
 * are never aggregated onto a public page. Canceled and finished events are
 * left out.
 */
export async function listTerritoryEvents(
  auth: AuthContext | null,
  area: TerritoryArea,
  limit = 20,
): Promise<TerritoryEvent[]> {
  const visibilities =
    auth && !isSuspended(auth) ? ["public", "members"] : ["public"];
  const result = await db.execute<{
    id: string;
    title: string;
    start_at: Date;
    end_at: Date;
    time_zone: string;
    event_type: string;
    spot_id: number | null;
    site_id: number | null;
    spot_name: string | null;
    slug_state: string | null;
    slug_locality: string | null;
    slug: string | null;
    site_name: string | null;
  }>(sql`
    SELECT e.id, e.title, e.start_at, e.end_at, e.time_zone, e.event_type,
           e.spot_id, e.site_id,
           s.name AS spot_name, s.slug_state, s.slug_locality, s.slug,
           st.name AS site_name
    FROM care_events e
    LEFT JOIN spots s ON s.spot_id = e.spot_id
    LEFT JOIN sites st ON st.site_id = e.site_id
    WHERE e.status = 'planned'
      AND e.end_at > now()
      AND e.visibility IN (${sql.join(visibilities.map((v) => sql`${v}`), sql`, `)})
      AND (
        e.spot_id IN ${areaSpotIds(area)}
        OR e.site_id IN ${areaSiteIds(area)}
      )
    ORDER BY e.start_at ASC
    LIMIT ${limit}
  `);

  return result.rows.map((r) => ({
    id: r.id,
    title: r.title,
    startAt: new Date(r.start_at).toISOString(),
    endAt: new Date(r.end_at).toISOString(),
    timeZone: r.time_zone,
    eventType: r.event_type,
    place:
      r.spot_id != null
        ? {
            kind: "spot",
            name: r.spot_name ?? "Spot",
            spotId: r.spot_id,
            slugState: r.slug_state,
            slugLocality: r.slug_locality,
            slug: r.slug,
            siteId: null,
          }
        : {
            kind: "site",
            name: r.site_name ?? "Site",
            spotId: null,
            slugState: null,
            slugLocality: null,
            slug: null,
            siteId: r.site_id,
          },
  }));
}

/**
 * Open native tasks at spots, sites, observations and events in the area.
 * Tasks are never public: verified members and admins only, others get an
 * empty list. Tasks for Asana-bound spots live in Asana and are not listed.
 */
export async function listTerritoryTasks(
  auth: AuthContext | null,
  area: TerritoryArea,
  limit = 20,
): Promise<TerritoryTask[]> {
  if (!auth || !isTaskMember(auth)) return [];
  const spotIds = areaSpotIds(area);
  const siteIds = areaSiteIds(area);
  const result = await db.execute<{
    id: string;
    title: string;
    status: string;
    due_on: string | null;
    assignee_name: string | null;
    spot_id: number | null;
    site_id: number | null;
    spot_name: string | null;
    slug_state: string | null;
    slug_locality: string | null;
    slug: string | null;
    site_name: string | null;
  }>(sql`
    SELECT t.id, t.title, t.status, t.due_on, au.username AS assignee_name,
           ps.spot_id, COALESCE(t.site_id, ce.site_id) AS site_id,
           ps.name AS spot_name, ps.slug_state, ps.slug_locality, ps.slug,
           st.name AS site_name
    FROM tasks t
    LEFT JOIN users au ON au.user_id = t.assignee_user_id
    LEFT JOIN observations o ON o.observation_id = t.observation_id
    LEFT JOIN care_events ce ON ce.id = t.event_id
    -- The spot a task is about: its own, its observation's, or its event's.
    LEFT JOIN spots ps
      ON ps.spot_id = COALESCE(t.spot_id, o.spot_id, ce.spot_id)
    -- The site it is about when there is no spot: its own, or its event's.
    LEFT JOIN sites st
      ON st.site_id = COALESCE(t.site_id, ce.site_id) AND ps.spot_id IS NULL
    WHERE t.status IN ('open', 'in_progress')
      AND (
        COALESCE(t.spot_id, o.spot_id, ce.spot_id) IN ${spotIds}
        OR (
          COALESCE(t.spot_id, o.spot_id, ce.spot_id) IS NULL
          AND COALESCE(t.site_id, ce.site_id) IN ${siteIds}
        )
      )
    ORDER BY t.due_on ASC NULLS LAST, t.created_at DESC
    LIMIT ${limit}
  `);

  return result.rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status as TaskStatus,
    dueOn: r.due_on,
    assigneeName: r.assignee_name,
    place:
      r.spot_id != null
        ? {
            kind: "spot",
            name: r.spot_name ?? "Spot",
            spotId: r.spot_id,
            slugState: r.slug_state,
            slugLocality: r.slug_locality,
            slug: r.slug,
            siteId: null,
          }
        : {
            kind: "site",
            name: r.site_name ?? "Site",
            spotId: null,
            slugState: null,
            slugLocality: null,
            slug: null,
            siteId: r.site_id,
          },
  }));
}
