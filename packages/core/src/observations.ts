import { db, observations, photos, spots, users } from "@placekeeping/db";
import type {
  CreateObservationInput,
  Observation,
  UpdateObservationInput,
  Vegetation,
  WeedLevel,
} from "@placekeeping/shared-types";
import { desc, eq } from "drizzle-orm";
import { diffFields, logEvent, snapshotToChanges } from "./events";
import { checkPhotoUrls, getModerationMode } from "./photoModeration";
import { isOwnStorageUrl, ownStorageKey } from "./photoStorage";
import { listPhotosForObservations } from "./photos";

function toObservationDto(row: typeof observations.$inferSelect): Observation {
  return {
    observationId: row.observationId,
    spotId: row.spotId,
    observedAt: row.observedAt,
    observerName: row.observerName,
    observerId: row.observerId,
    notes: row.notes,
    vegetation: row.vegetation as Vegetation | null,
    weedLevel: row.weedLevel as WeedLevel | null,
    stewardId: row.stewardId,
    photoUrls: row.photoUrls,
    inaturalistObsUrl: row.inaturalistObsUrl,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getObservationById(
  observationId: string,
): Promise<Observation | null> {
  const [row] = await db
    .select()
    .from(observations)
    .where(eq(observations.observationId, observationId))
    .limit(1);
  return row ? toObservationDto(row) : null;
}

export async function listObservationsForSpot(
  spotId: number,
): Promise<Observation[]> {
  const rows = await db
    .select()
    .from(observations)
    .where(eq(observations.spotId, spotId))
    .orderBy(desc(observations.observedAt));
  const dtos = rows.map(toObservationDto);

  const photosByObservation = await listPhotosForObservations(
    dtos.map((o) => o.observationId),
  );
  return dtos.map((o) => ({
    ...o,
    photos: photosByObservation.get(o.observationId) ?? [],
  }));
}

// For the profile page's observation history -- joins in the spot name
// since an observation on its own doesn't say where it was made.
export async function listObservationsByObserver(
  observerId: string,
  limit = 20,
): Promise<Array<{ observationId: string; spotId: number; spotName: string; observedAt: string; createdAt: string }>> {
  const rows = await db
    .select({
      observationId: observations.observationId,
      spotId: observations.spotId,
      spotName: spots.name,
      observedAt: observations.observedAt,
      createdAt: observations.createdAt,
    })
    .from(observations)
    .innerJoin(spots, eq(observations.spotId, spots.spotId))
    .where(eq(observations.observerId, observerId))
    .orderBy(desc(observations.observedAt))
    .limit(limit);
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

// Backs the admin dashboard's recent-activity log (apps/web /admin).
export async function listRecentObservations(limit = 10): Promise<
  Array<{
    observationId: string;
    spotId: number;
    spotName: string;
    observerUsername: string | null;
    createdAt: string;
  }>
> {
  const rows = await db
    .select({
      observationId: observations.observationId,
      spotId: observations.spotId,
      spotName: spots.name,
      observerUsername: users.username,
      createdAt: observations.createdAt,
    })
    .from(observations)
    .innerJoin(spots, eq(observations.spotId, spots.spotId))
    .leftJoin(users, eq(users.userId, observations.observerId))
    .orderBy(desc(observations.createdAt))
    .limit(limit);
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

// Cheaper than listObservationsForSpot when only presence matters -- used to
// gate spot deletion (only an admin may delete a spot that has observations).
export async function spotHasObservations(spotId: number): Promise<boolean> {
  const [row] = await db
    .select({ observationId: observations.observationId })
    .from(observations)
    .where(eq(observations.spotId, spotId))
    .limit(1);
  return !!row;
}

// "Log stewardship activity": lets the observer credit themselves as having
// tended the spot on this one visit, even if the spot itself has no
// official steward (or a different one) -- see local design notes on
// observations.stewardId. Caller (the API route) has already confirmed the
// observation is still within its edit window and that stewardId belongs to
// the same caller.
export async function claimObservationStewardship(
  observationId: string,
  stewardId: string,
): Promise<Observation> {
  const [row] = await db
    .update(observations)
    .set({ stewardId })
    .where(eq(observations.observationId, observationId))
    .returning();
  return toObservationDto(row);
}

export async function createObservation(
  spotId: number,
  input: CreateObservationInput,
  // The authenticated caller who submitted this observation (and any
  // photos on it) -- null for the seed script and any other server-side
  // caller without a logged-in user.
  userId: string | null,
  // The caller's own stewardId, if they have one -- used only when
  // input.claimStewardship is set, letting them log stewardship activity in
  // the same step as creating the observation instead of a separate claim
  // call afterward. Null/omitted for callers who aren't a steward.
  callerStewardId: string | null = null,
): Promise<Observation> {
  const urlsNeedingModeration = input.photoUrls.filter((url) => !isOwnStorageUrl(url));
  await checkPhotoUrls(urlsNeedingModeration);

  // Snapshot the spot's current steward onto the observation -- who was
  // tending it "now" only means anything at the moment of the visit, and
  // spots.stewardId can be reassigned or cleared later. See schema.ts.
  // A caller claiming stewardship for this one visit overrides that.
  const [spot] = await db
    .select({ stewardId: spots.stewardId })
    .from(spots)
    .where(eq(spots.spotId, spotId))
    .limit(1);

  const stewardId =
    input.claimStewardship && callerStewardId
      ? callerStewardId
      : (spot?.stewardId ?? null);

  const [row] = await db
    .insert(observations)
    .values({
      spotId,
      observedAt: input.observedAt,
      observerName: input.observerName,
      observerId: userId,
      notes: input.notes,
      vegetation: input.vegetation ?? null,
      weedLevel: input.weedLevel ?? null,
      stewardId,
      photoUrls: input.photoUrls,
      inaturalistObsUrl: input.inaturalistObsUrl,
    })
    .returning();

  // Every URL here has already passed (or, in "none" mode, skipped)
  // moderation above -- a failing check throws before this point, so
  // "rejected" never gets written at insert time. See photos.moderationStatus.
  if (input.photoUrls.length > 0) {
    const moderationStatus: "skipped" | "approved" =
      getModerationMode() === "none" ? "skipped" : "approved";
    await db.insert(photos).values(
      input.photoUrls.map((url) => ({
        observationId: row.observationId,
        url,
        storageKey: ownStorageKey(url),
        uploadedByUserId: userId,
        moderationStatus,
      })),
    );
  }

  await logEvent({
    entityType: "observation",
    entityId: row.observationId,
    action: "create",
    userId,
    changes: snapshotToChanges(
      toObservationDto(row) as unknown as Record<string, unknown>,
      "create",
    ),
  });

  return toObservationDto(row);
}

// Undefined fields on `input` mean "leave unchanged" -- the caller (the API
// route) is expected to have already checked canEditObservation, so this
// doesn't re-check ownership or the edit-window itself.
export async function updateObservation(
  observationId: string,
  input: UpdateObservationInput,
  // The caller, for photos.uploadedByUserId on any newly-added photo -- same
  // person canEditObservation already confirmed owns this observation.
  userId: string | null,
): Promise<Observation> {
  const existing = await getObservationById(observationId);
  if (!existing) {
    throw new Error(`Observation not found: ${observationId}`);
  }

  const nextPhotoUrls = input.photoUrls ?? existing.photoUrls;
  // Only re-moderate photos that weren't already on the observation -- no
  // need to re-check ones that passed (or were skipped) at creation time.
  const addedUrls = nextPhotoUrls.filter(
    (url) => !existing.photoUrls.includes(url),
  );
  const urlsNeedingModeration = addedUrls.filter((url) => !isOwnStorageUrl(url));
  await checkPhotoUrls(urlsNeedingModeration);

  const [row] = await db
    .update(observations)
    .set({
      observedAt: input.observedAt ?? existing.observedAt,
      notes: input.notes ?? existing.notes,
      vegetation: input.vegetation ?? existing.vegetation,
      weedLevel: input.weedLevel ?? existing.weedLevel,
      photoUrls: nextPhotoUrls,
      inaturalistObsUrl: input.inaturalistObsUrl ?? existing.inaturalistObsUrl,
    })
    .where(eq(observations.observationId, observationId))
    .returning();

  if (addedUrls.length > 0) {
    const moderationStatus: "skipped" | "approved" =
      getModerationMode() === "none" ? "skipped" : "approved";
    await db.insert(photos).values(
      addedUrls.map((url) => ({
        observationId,
        url,
        storageKey: ownStorageKey(url),
        uploadedByUserId: userId,
        moderationStatus,
      })),
    );
  }

  const updated = toObservationDto(row);
  const changes = diffFields(
    existing as unknown as Record<string, unknown>,
    updated as unknown as Record<string, unknown>,
    input as Record<string, unknown>,
  );
  if (changes) {
    await logEvent({
      entityType: "observation",
      entityId: observationId,
      action: "update",
      userId,
      changes,
    });
  }

  return updated;
}
