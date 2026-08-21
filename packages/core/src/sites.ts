import { db, parcels, siteParcels, sites, spots, users } from "@placekeeping/db";
import type { LinkSpotToSiteInput, Site, UpdateSiteInput } from "@placekeeping/shared-types";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { diffFields, logEvent, snapshotToChanges } from "./events";

const siteColumns = {
  siteId: sites.siteId,
  name: sites.name,
  purpose: sites.purpose,
  gisOpenSpace: sites.gisOpenSpace,
  gisLandUse: sites.gisLandUse,
  hnpMapNumber: sites.hnpMapNumber,
  stewardshipProgram: sites.stewardshipProgram,
  stewardshipRef: sites.stewardshipRef,
  legalOwner: sites.legalOwner,
  createdBy: sites.createdBy,
  createdAt: sites.createdAt,
  updatedAt: sites.updatedAt,
};

export function toSiteDto(row: any): Site {
  return {
    siteId: row.siteId,
    name: row.name,
    purpose: row.purpose,
    gisOpenSpace: row.gisOpenSpace,
    gisLandUse: row.gisLandUse,
    hnpMapNumber: row.hnpMapNumber,
    stewardshipProgram: row.stewardshipProgram,
    stewardshipRef: row.stewardshipRef,
    legalOwner: row.legalOwner,
    createdBy: row.createdBy ?? null,
    createdByUsername: row.createdByUsername ?? null,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

export async function getSiteById(siteId: number): Promise<Site | null> {
  const [row] = await db
    .select({ ...siteColumns, createdByUsername: users.username })
    .from(sites)
    .leftJoin(users, eq(users.userId, sites.createdBy))
    .where(eq(sites.siteId, siteId))
    .limit(1);
  return row ? toSiteDto(row) : null;
}

export async function listSites(): Promise<Site[]> {
  const rows = await db.select(siteColumns).from(sites).orderBy(sites.name);
  return rows.map(toSiteDto);
}

// Backs the admin dashboard's recent-activity log (apps/web /admin).
export async function listRecentSites(limit = 10): Promise<Site[]> {
  const rows = await db
    .select({ ...siteColumns, createdByUsername: users.username })
    .from(sites)
    .leftJoin(users, eq(users.userId, sites.createdBy))
    .orderBy(desc(sites.createdAt))
    .limit(limit);
  return rows.map(toSiteDto);
}

export interface SiteParcelGeometry {
  swisSblId: string;
  printKey: string | null;
  address: string | null;
  propClass: string | null;
  calcAcres: number | null;
  rollYr: number | null;
  // Raw GeoJSON MultiPolygon, ready for a client-side conversion to map
  // polygon paths. [lng, lat] order per GeoJSON convention.
  geometry: { type: "MultiPolygon"; coordinates: number[][][][] };
  // See parcels.shapeFlag / computeShapeFlag in packages/core/src/parcels.ts.
  shapeFlag: boolean;
}

// One row per parcel identifier (not per cached roll year) -- takes the
// most recent cached geometry when a parcel has been re-fetched across
// multiple assessment rolls.
export async function getSiteParcelGeometries(
  siteId: number,
): Promise<SiteParcelGeometry[]> {
  const rows = await db
    .selectDistinctOn([parcels.swisSblId], {
      swisSblId: parcels.swisSblId,
      printKey: parcels.printKey,
      address: parcels.address,
      propClass: parcels.propClass,
      calcAcres: parcels.calcAcres,
      rollYr: parcels.rollYr,
      geometryJson: sql<string>`ST_AsGeoJSON(${parcels.geom})`,
      shapeFlag: parcels.shapeFlag,
    })
    .from(siteParcels)
    .innerJoin(parcels, eq(parcels.swisSblId, siteParcels.swisSblId))
    .where(eq(siteParcels.siteId, siteId))
    .orderBy(parcels.swisSblId, desc(parcels.rollYr));

  return rows.map((row) => ({
    swisSblId: row.swisSblId,
    printKey: row.printKey,
    address: row.address,
    propClass: row.propClass,
    calcAcres: row.calcAcres === null ? null : Number(row.calcAcres),
    rollYr: row.rollYr,
    geometry: JSON.parse(row.geometryJson),
    shapeFlag: row.shapeFlag,
  }));
}

export async function getSiteParcelSwisSblIds(
  siteId: number,
): Promise<string[]> {
  const rows = await db
    .select({ swisSblId: siteParcels.swisSblId })
    .from(siteParcels)
    .where(eq(siteParcels.siteId, siteId));
  return rows.map((r) => r.swisSblId);
}

export type RemoveSiteParcelResult =
  | { ok: true }
  | { ok: false; reason: "not_linked" }
  | { ok: false; reason: "in_use"; spotNames: string[] };

// Manual admin/creator curation: drop a parcel from a site's extent
// (site_parcels) directly. The only other paths that touch site_parcels are
// spot-driven (linkSpotToSite, reassignSpotParcel above) and already keep
// themselves consistent; this is the one place a human can remove a parcel
// without going through a spot. Refuses when a member spot's parcel_sbl
// still points at it -- deleting out from under a spot would drop it from
// the site's own parcel list while the spot still claims it. Reassign or
// clear that spot's parcel first (reassignSpotParcel), then retry.
export async function removeSiteParcel(
  siteId: number,
  swisSblId: string,
  actorUserId: string | null = null,
): Promise<RemoveSiteParcelResult> {
  const inUseBy = await db
    .select({ name: spots.name })
    .from(spots)
    .where(and(eq(spots.siteId, siteId), eq(spots.parcelSbl, swisSblId)));
  if (inUseBy.length > 0) {
    return {
      ok: false,
      reason: "in_use",
      spotNames: inUseBy.map((s) => s.name),
    };
  }

  const deleted = await db
    .delete(siteParcels)
    .where(
      and(
        eq(siteParcels.siteId, siteId),
        eq(siteParcels.swisSblId, swisSblId),
      ),
    )
    .returning({ swisSblId: siteParcels.swisSblId });
  if (deleted.length === 0) {
    return { ok: false, reason: "not_linked" };
  }

  await logEvent({
    entityType: "site",
    entityId: siteId,
    action: "update",
    userId: actorUserId,
    changes: { parcel: { from: swisSblId, to: null } },
  });
  return { ok: true };
}

export type ReassignSiteParcelResult =
  | { ok: true; site: Site }
  | { ok: false; reason: "not_linked" }
  | { ok: false; reason: "same_site" };

// Admin/creator curation: move a parcel from one site to another -- existing
// or brand new -- rather than only being able to drop it (removeSiteParcel
// above). Any member spot of the *source* site still resolved to this
// parcel moves with it (its siteId is repointed), since a spot's site
// membership follows the parcel it's anchored to -- leaving it behind would
// recreate the same site_parcels/spot inconsistency removeSiteParcel
// refuses to create. Mirrors linkSpotToSite's "existing site or create one"
// input shape and transaction structure.
export async function reassignSiteParcel(
  fromSiteId: number,
  swisSblId: string,
  target: LinkSpotToSiteInput,
  actorUserId: string | null = null,
): Promise<ReassignSiteParcelResult> {
  if ("siteId" in target && target.siteId === fromSiteId) {
    return { ok: false, reason: "same_site" };
  }

  // Thrown to roll back the transaction (including a just-created new site)
  // when the parcel turns out not to be linked to the source site -- caught
  // below and turned back into a result rather than an exception.
  class NotLinkedError extends Error {}

  try {
    return await db.transaction(async (tx) => {
      let toSiteId: number;

      if ("siteId" in target) {
        toSiteId = target.siteId;
      } else {
        const [created] = await tx
          .insert(sites)
          .values({
            name: target.newSite.name,
            purpose: target.newSite.purpose,
            createdBy: actorUserId,
          })
          .returning({ siteId: sites.siteId });
        toSiteId = created.siteId;
        await logEvent(
          {
            entityType: "site",
            entityId: toSiteId,
            action: "create",
            userId: actorUserId,
            changes: snapshotToChanges(
              { name: target.newSite.name, purpose: target.newSite.purpose },
              "create",
            ),
          },
          tx,
        );
      }

      const deleted = await tx
        .delete(siteParcels)
        .where(
          and(
            eq(siteParcels.siteId, fromSiteId),
            eq(siteParcels.swisSblId, swisSblId),
          ),
        )
        .returning({ swisSblId: siteParcels.swisSblId });
      if (deleted.length === 0) {
        throw new NotLinkedError();
      }

      await tx
        .insert(siteParcels)
        .values({ siteId: toSiteId, swisSblId })
        .onConflictDoNothing();

      await tx
        .update(spots)
        .set({ siteId: toSiteId })
        .where(
          and(eq(spots.siteId, fromSiteId), eq(spots.parcelSbl, swisSblId)),
        );

      await logEvent(
        {
          entityType: "site",
          entityId: fromSiteId,
          action: "update",
          userId: actorUserId,
          changes: { parcel: { from: swisSblId, to: null } },
        },
        tx,
      );
      await logEvent(
        {
          entityType: "site",
          entityId: toSiteId,
          action: "update",
          userId: actorUserId,
          changes: { parcel: { from: null, to: swisSblId } },
        },
        tx,
      );

      const [row] = await tx
        .select({ ...siteColumns, createdByUsername: users.username })
        .from(sites)
        .leftJoin(users, eq(users.userId, sites.createdBy))
        .where(eq(sites.siteId, toSiteId))
        .limit(1);
      return { ok: true as const, site: toSiteDto(row) };
    });
  } catch (error) {
    if (error instanceof NotLinkedError) {
      return { ok: false, reason: "not_linked" };
    }
    throw error;
  }
}

export async function updateSite(
  siteId: number,
  input: UpdateSiteInput,
  actorUserId: string | null = null,
): Promise<Site | null> {
  const current = await getSiteById(siteId);
  if (!current) return null;

  await db
    .update(sites)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(sites.siteId, siteId));

  const updated = await getSiteById(siteId);
  if (updated) {
    const changes = diffFields(
      current as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
      input as Record<string, unknown>,
    );
    if (changes) {
      await logEvent({
        entityType: "site",
        entityId: siteId,
        action: "update",
        userId: actorUserId,
        changes,
      });
    }
  }
  return updated;
}

// The local/spot-resolution.md §8 cascade save: join an existing site, or
// create one scoped to the spot's already-resolved parcel, then link the
// spot -- all in one transaction so there's no path to a spot pointing at a
// site whose insert failed.
export async function linkSpotToSite(
  spotId: number,
  swisSblId: string,
  input: LinkSpotToSiteInput,
  createdByUserId: string | null,
): Promise<Site> {
  return db.transaction(async (tx) => {
    let siteId: number;

    if ("siteId" in input) {
      siteId = input.siteId;
    } else {
      const [created] = await tx
        .insert(sites)
        .values({
          name: input.newSite.name,
          purpose: input.newSite.purpose,
          createdBy: createdByUserId,
        })
        .returning({ siteId: sites.siteId });
      siteId = created.siteId;
      await logEvent(
        {
          entityType: "site",
          entityId: siteId,
          action: "create",
          userId: createdByUserId,
          changes: snapshotToChanges(
            { name: input.newSite.name, purpose: input.newSite.purpose },
            "create",
          ),
        },
        tx,
      );
    }

    await tx
      .insert(siteParcels)
      .values({ siteId, swisSblId })
      .onConflictDoNothing();

    await tx.update(spots).set({ siteId }).where(eq(spots.spotId, spotId));

    const [row] = await tx
      .select({ ...siteColumns, createdByUsername: users.username })
      .from(sites)
      .leftJoin(users, eq(users.userId, sites.createdBy))
      .where(eq(sites.siteId, siteId))
      .limit(1);
    return toSiteDto(row);
  });
}

// Repoints a spot at a different parcel (or clears it to "no parcel"), used
// by both the initial-discovery confirm step and the post-link "Change
// parcel" flow (local/spot-resolution.md). Lives here rather than in
// parcels.ts/spots.ts because the interesting part is site_parcels
// consistency, the same aggregate concern linkSpotToSite already owns.
//
// When the spot is already linked to a site: the new parcel is added to
// site_parcels (if not already present), and the *old* parcel is dropped
// from site_parcels only if no other spot in the same site still points at
// it -- a wrongly-discovered parcel (e.g. a street ROW) shouldn't linger in
// the site's extent just because one spot briefly pointed at it.
export async function reassignSpotParcel(
  spotId: number,
  newParcel: { swisSblId: string; rollYr: number | null } | null,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [spot] = await tx
      .select({ parcelSbl: spots.parcelSbl, siteId: spots.siteId })
      .from(spots)
      .where(eq(spots.spotId, spotId))
      .limit(1);
    if (!spot) throw new Error("Spot not found");

    const oldSwisSblId = spot.parcelSbl;

    await tx
      .update(spots)
      .set({
        parcelSbl: newParcel?.swisSblId ?? null,
        resolvedRollYr: newParcel?.rollYr ?? null,
        parcelStatus: newParcel ? "resolved" : "no_parcel",
      })
      .where(eq(spots.spotId, spotId));

    if (!spot.siteId) return; // pre-link: no site_parcels bookkeeping yet

    if (newParcel) {
      await tx
        .insert(siteParcels)
        .values({ siteId: spot.siteId, swisSblId: newParcel.swisSblId })
        .onConflictDoNothing();
    }

    if (oldSwisSblId && oldSwisSblId !== newParcel?.swisSblId) {
      const [stillUsed] = await tx
        .select({ spotId: spots.spotId })
        .from(spots)
        .where(
          and(
            eq(spots.siteId, spot.siteId),
            eq(spots.parcelSbl, oldSwisSblId),
            ne(spots.spotId, spotId),
          ),
        )
        .limit(1);
      if (!stillUsed) {
        await tx
          .delete(siteParcels)
          .where(
            and(
              eq(siteParcels.siteId, spot.siteId),
              eq(siteParcels.swisSblId, oldSwisSblId),
            ),
          );
      }
    }
  });
}
