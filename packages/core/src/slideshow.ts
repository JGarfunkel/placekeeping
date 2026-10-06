import { db, observations, photos, spots, stewards, subdivisions } from "@placekeeping/db";
import { STATE_CONFIGS } from "@placekeeping/shared-types";
import { and, asc, desc, eq, ne, or, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { SlideshowScope } from "./slideshowScope";

export const SLIDESHOW_ORDERS = ["newest", "oldest", "random", "spot"] as const;
export type SlideshowOrder = (typeof SLIDESHOW_ORDERS)[number];

export const SLIDESHOW_PAGE_SIZE = 200;

export interface Slide {
  observationId: string;
  photoId: string;
  photoUrl: string;
  spotId: number;
  spotName: string;
  // Path to the spot page, so the client needn't know the slug rules.
  spotPath: string;
  locationLabel: string;
  description: string | null;
  // YYYY-MM-DD -- observations.observedAt is a date with no time of day.
  observedAt: string;
  // stewards.name, only when the steward has publicDisplay on. Never an
  // owner or any natural-person ownership data.
  stewardName: string | null;
}

export interface SlideshowPage {
  slides: Slide[];
  total: number;
  nextOffset: number | null;
}

// Lowercased + hyphenated, the same shape territory slugs use, so a slug
// from the URL can be compared against free-text spots columns in SQL.
function slugSql(column: SQL | AnyPgColumn): SQL {
  return sql`trim(both '-' from regexp_replace(lower(${column}), '[^a-z0-9]+', '-', 'g'))`;
}

function scopeCondition(scope: SlideshowScope): SQL {
  switch (scope.kind) {
    case "spot":
      return eq(spots.spotId, scope.spotId);
    case "state": {
      const fullName = STATE_CONFIGS[scope.state]?.name.toLowerCase();
      const stateMatch = fullName
        ? or(sql`lower(${spots.state}) = ${scope.state}`, sql`lower(${spots.state}) = ${fullName}`)
        : sql`lower(${spots.state}) = ${scope.state}`;
      return stateMatch as SQL;
    }
    case "county":
      // Matches both "Westchester" and "Westchester County" spellings.
      return and(
        sql`lower(${spots.state}) = ${scope.state}`,
        sql`regexp_replace(${slugSql(spots.county)}, '-county$', '') = ${scope.countySlug}`,
      ) as SQL;
    case "municipality":
      return and(
        sql`lower(${spots.state}) = ${scope.state}`,
        or(
          sql`${slugSql(spots.municipality)} = ${scope.muniSlug}`,
          sql`${slugSql(spots.postalCity)} = ${scope.muniSlug}`,
        ),
      ) as SQL;
  }
}

// TODO: spots, observations and stewards have no hidden/flagged column yet.
// Once one exists, exclude flagged rows here -- until then the only
// "not public" signal is a rejected photo.
function visibilityCondition(): SQL {
  return ne(photos.moderationStatus, "rejected");
}

function orderBy(order: SlideshowOrder, seed: string): SQL[] {
  switch (order) {
    case "newest":
      return [desc(observations.observedAt), desc(photos.createdAt), asc(photos.photoId)];
    case "oldest":
      return [asc(observations.observedAt), asc(photos.createdAt), asc(photos.photoId)];
    case "spot":
      return [asc(spots.spotId), asc(observations.observedAt), asc(photos.createdAt), asc(photos.photoId)];
    case "random":
      // Seeded so every page of one shuffle comes from the same ordering.
      return [sql`md5(${photos.photoId}::text || ${seed})`];
  }
}

function slugPath(spot: {
  spotId: number;
  slugState: string | null;
  slugLocality: string | null;
  slug: string | null;
}): string {
  return spot.slugState && spot.slugLocality && spot.slug
    ? `/spots/us/${spot.slugState}/${spot.slugLocality}/${spot.slug}`
    : `/spots/${spot.spotId}`;
}

export function buildLocationLabel(
  spotName: string,
  municipality: string | null,
  postalCity: string | null,
): string {
  const place = municipality?.trim() || postalCity?.trim();
  return place && place.toLowerCase() !== spotName.trim().toLowerCase()
    ? `${spotName}, ${place}`
    : spotName;
}

export async function listSlides(
  scope: SlideshowScope,
  options: { order: SlideshowOrder; seed?: string; offset?: number; limit?: number },
): Promise<SlideshowPage> {
  const limit = Math.min(options.limit ?? SLIDESHOW_PAGE_SIZE, SLIDESHOW_PAGE_SIZE);
  const offset = Math.max(options.offset ?? 0, 0);
  const where = and(scopeCondition(scope), visibilityCondition());

  const base = () =>
    db
      .select()
      .from(photos)
      .innerJoin(observations, eq(photos.observationId, observations.observationId))
      .innerJoin(spots, eq(observations.spotId, spots.spotId))
      .leftJoin(stewards, eq(observations.stewardId, stewards.stewardId))
      .where(where);

  const [rows, [countRow]] = await Promise.all([
    base()
      .orderBy(...orderBy(options.order, options.seed ?? ""))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(photos)
      .innerJoin(observations, eq(photos.observationId, observations.observationId))
      .innerJoin(spots, eq(observations.spotId, spots.spotId))
      .where(where),
  ]);

  const total = countRow?.count ?? 0;
  const slides: Slide[] = rows.map((row) => ({
    observationId: row.observations.observationId,
    photoId: row.photos.photoId,
    photoUrl: row.photos.url,
    spotId: row.spots.spotId,
    spotName: row.spots.name,
    spotPath: slugPath(row.spots),
    locationLabel: buildLocationLabel(row.spots.name, row.spots.municipality, row.spots.postalCity),
    description: row.observations.notes?.trim() || null,
    observedAt: row.observations.observedAt,
    stewardName: row.stewards?.publicDisplay ? row.stewards.name : null,
  }));

  return {
    slides,
    total,
    nextOffset: offset + slides.length < total ? offset + slides.length : null,
  };
}

// Display name for the slideshow title: the cached subdivisions name when
// there is one, else a title-cased slug.
export async function getSlideshowTitle(scope: SlideshowScope): Promise<string | null> {
  if (scope.kind === "spot") {
    const [row] = await db
      .select({ name: spots.name })
      .from(spots)
      .where(eq(spots.spotId, scope.spotId))
      .limit(1);
    return row?.name ?? null;
  }
  const [row] = await db
    .select({ name: subdivisions.name })
    .from(subdivisions)
    .where(eq(subdivisions.path, scope.path))
    .limit(1);
  if (row) return row.name;
  const last = scope.path.split("/").pop() ?? scope.path;
  return last
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
