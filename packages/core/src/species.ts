import {
  db,
  identifications,
  observationPlants,
  observations,
  photos,
  taxa,
} from "@placekeeping/db";
import type {
  CropRect,
  IdentifyRequest,
  IdentifyResult,
  Identification,
  ManualSpeciesRequest,
  ObservationPlant,
  PlantSource,
  PlantStatus,
  SpeciesCounts,
  Taxon,
} from "@placekeeping/shared-types";
import { and, asc, count, eq, gt, inArray, isNotNull, ne, sql, type SQL } from "drizzle-orm";
import sharp from "sharp";
import { isSuspended, type AuthContext } from "./auth";
import { debugLog } from "./debug";
import { readObject } from "./photoStorage";
import { logRemoteCall } from "./remoteLog";

// Species identification via Pl@ntNet -- design in local/species-id.md.
// Three tables: taxa (shared species list), identifications (one per plant a
// keeper outlines: a rectangle on a photo, or the whole photo) and
// observation_plants (candidates and confirmed species for an
// identification). The Pl@ntNet key never leaves the server.

export class SpeciesError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "SpeciesError";
  }
}

const PLANTNET_BASE = "https://my-api.plantnet.org/v2/identify";
// Regional flora to match against -- Pl@ntNet "project" ids come from
// GET /v2/projects. Northeastern U.S. is where the app's spots are.
const DEFAULT_PROJECT = "k-northeastern-u-s-a";
const PLANTNET_TIMEOUT_MS = 25_000;

/** Candidates kept per identification, and the score below which they're dropped. */
export const MAX_CANDIDATES = 5;
export const MIN_CANDIDATE_SCORE = 0.05;

/**
 * Smallest side, in pixels of the stored original, a crop may have. Starting
 * guess -- identification quality falls as detail drops (open question in the
 * design doc); tune against real photos.
 */
export const MIN_CROP_PX = 100;
/** Crops are downscaled to this long edge before sending; Pl@ntNet shrinks them anyway. */
const SEND_MAX_LONG_EDGE_PX = 1280;

function envInt(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// Rolling 24h limits, counted from identifications rows where a Pl@ntNet
// call was attempted. The free tier allows 500 requests a day overall.
// Soft limits (count-then-insert, not atomic) -- fine at this scale.
function quotaLimits() {
  return {
    userPerDay: envInt("PLANTNET_USER_DAILY_LIMIT", 30),
    perObservation: envInt("PLANTNET_OBSERVATION_LIMIT", 20),
    globalPerDay: envInt("PLANTNET_GLOBAL_DAILY_LIMIT", 400),
  };
}

// --- permissions ----------------------------------------------------------

/**
 * Who may identify and confirm species on an observation. The design's
 * suggested start: its author (system admins too). No edit-window cutoff,
 * unlike canEditObservation -- identifying is annotation, not rewriting the
 * record.
 */
export function canIdentifyObservation(
  authContext: AuthContext,
  observation: { observerId: string | null },
): boolean {
  if (isSuspended(authContext)) return false;
  if (authContext.isSystemAdmin) return true;
  return !!observation.observerId && observation.observerId === authContext.userId;
}

async function requireIdentifiableObservation(
  authContext: AuthContext,
  observationId: string,
): Promise<void> {
  const [owner] = await db
    .select({ observerId: observations.observerId })
    .from(observations)
    .where(eq(observations.observationId, observationId))
    .limit(1);
  if (!owner) throw new SpeciesError(404, "Not found");
  if (!canIdentifyObservation(authContext, owner)) {
    throw new SpeciesError(403, "Only the observer can identify species on this observation.");
  }
}

// --- taxa -----------------------------------------------------------------

type TaxonRow = typeof taxa.$inferSelect;

function toTaxon(row: TaxonRow): Taxon {
  return {
    taxonId: row.taxonId,
    scientificName: row.scientificName,
    commonName: row.commonName,
    family: row.family,
  };
}

type TaxonInput = {
  gbifKey: number | null;
  scientificName: string;
  commonName: string | null;
  family: string | null;
  rank?: string | null;
};

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Finds or creates a taxon. With a gbifKey, upserts on it (refreshing names,
 * which change over time, without erasing a known common name). Without one
 * (a keeper-typed name), reuses any existing taxon with that scientific name
 * -- gbif-keyed or not -- before creating a key-less row.
 */
async function upsertTaxon(tx: Tx, input: TaxonInput): Promise<TaxonRow> {
  if (input.gbifKey !== null) {
    const [row] = await tx
      .insert(taxa)
      .values({
        gbifKey: input.gbifKey,
        scientificName: input.scientificName,
        commonName: input.commonName,
        family: input.family,
        rank: input.rank ?? "species",
      })
      .onConflictDoUpdate({
        target: taxa.gbifKey,
        set: {
          scientificName: input.scientificName,
          commonName: sql`COALESCE(excluded.common_name, ${taxa.commonName})`,
          family: sql`COALESCE(excluded.family, ${taxa.family})`,
        },
      })
      .returning();
    return row;
  }
  const findByName = () =>
    tx
      .select()
      .from(taxa)
      .where(sql`lower(${taxa.scientificName}) = lower(${input.scientificName})`)
      .orderBy(sql`${taxa.gbifKey} IS NULL`)
      .limit(1);
  const [existing] = await findByName();
  if (existing) return existing;
  const [row] = await tx
    .insert(taxa)
    .values({
      scientificName: input.scientificName,
      commonName: input.commonName,
      family: input.family,
      rank: input.rank ?? null,
    })
    .onConflictDoNothing()
    .returning();
  if (row) return row;
  // Lost a race with a concurrent insert of the same name.
  return (await findByName())[0];
}

/** Autocomplete for manual entry: substring match on either name, prefix matches first. */
export async function searchTaxa(query: string, limit = 10): Promise<Taxon[]> {
  const q = query.trim().replace(/[%_\\]/g, (c) => `\\${c}`);
  if (q.length < 2) return [];
  const rows = await db
    .select()
    .from(taxa)
    .where(
      sql`${taxa.scientificName} ILIKE ${`%${q}%`} OR ${taxa.commonName} ILIKE ${`%${q}%`}`,
    )
    .orderBy(
      sql`(${taxa.scientificName} ILIKE ${`${q}%`} OR ${taxa.commonName} ILIKE ${`${q}%`}) DESC`,
      asc(taxa.scientificName),
    )
    .limit(limit);
  return rows.map(toTaxon);
}

// --- pl@ntnet -------------------------------------------------------------

type PlantNetResult = {
  score: number;
  species: {
    scientificNameWithoutAuthor: string;
    family?: { scientificNameWithoutAuthor?: string };
    commonNames?: string[];
  };
  gbif?: { id?: string | number };
};

type PlantNetResponse = {
  results?: PlantNetResult[];
  remainingIdentificationRequests?: number;
};

type PlantNetOutcome = {
  /** HTTP status, or 0 when no response arrived (network error / timeout). */
  status: number;
  body: PlantNetResponse | null;
};

async function callPlantNet(image: Buffer, organ: string): Promise<PlantNetOutcome> {
  const apiKey = process.env.PLANTNET_API_KEY;
  if (!apiKey) {
    console.error("[species] PLANTNET_API_KEY is not set");
    throw new SpeciesError(503, "Identification is unavailable right now.");
  }
  const project = process.env.PLANTNET_PROJECT || DEFAULT_PROJECT;

  const form = new FormData();
  form.append("images", new Blob([new Uint8Array(image)], { type: "image/jpeg" }), "crop.jpg");
  form.append("organs", organ);
  const params = new URLSearchParams({
    "api-key": apiKey,
    "nb-results": String(MAX_CANDIDATES),
    "include-related-images": "false",
    lang: "en",
  });

  try {
    const response = await logRemoteCall(
      "plantnet",
      "identify",
      () =>
        fetch(`${PLANTNET_BASE}/${encodeURIComponent(project)}?${params}`, {
          method: "POST",
          body: form,
          signal: AbortSignal.timeout(PLANTNET_TIMEOUT_MS),
        }),
      PLANTNET_TIMEOUT_MS + 1000,
    );
    // Pl@ntNet answers 404 "Species not found" when nothing matches; that is
    // a valid (empty) outcome, not a failure.
    const body = response.ok
      ? ((await response.json().catch(() => null)) as PlantNetResponse | null)
      : null;
    return { status: response.status, body };
  } catch (error) {
    // Deliberately not logging the request URL: it carries the api key.
    debugLog("[species] plantnet request failed:", (error as Error).message);
    return { status: 0, body: null };
  }
}

// --- quota ----------------------------------------------------------------

async function assertQuota(userId: string, observationId: string): Promise<void> {
  const limits = quotaLimits();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const attempted = and(
    isNotNull(identifications.plantnetStatus),
    gt(identifications.createdAt, since),
  );
  const [[global], [mine], [forObservation]] = await Promise.all([
    db.select({ n: count() }).from(identifications).where(attempted),
    db
      .select({ n: count() })
      .from(identifications)
      .where(and(attempted, eq(identifications.userId, userId))),
    db
      .select({ n: count() })
      .from(identifications)
      .where(
        and(
          isNotNull(identifications.plantnetStatus),
          eq(identifications.observationId, observationId),
        ),
      ),
  ]);
  if (global.n >= limits.globalPerDay) {
    throw new SpeciesError(
      429,
      "Species identification has reached its daily limit for everyone. Please try again tomorrow, or enter the species by name.",
    );
  }
  if (mine.n >= limits.userPerDay) {
    throw new SpeciesError(
      429,
      "You've reached today's limit for species identification. Please try again tomorrow, or enter the species by name.",
    );
  }
  if (forObservation.n >= limits.perObservation) {
    throw new SpeciesError(
      429,
      "This observation has reached its limit for species identification. You can still enter species by name.",
    );
  }
}

// --- crop -----------------------------------------------------------------

function cropColumns(crop: CropRect | null | undefined) {
  return crop
    ? { cropX: crop.x, cropY: crop.y, cropW: crop.w, cropH: crop.h }
    : { cropX: null, cropY: null, cropW: null, cropH: null };
}

/**
 * Crops the stored original to `crop` in memory (never written back) and
 * returns JPEG bytes ready for Pl@ntNet. Throws SpeciesError 422, without
 * having called Pl@ntNet, when the region is too small to identify.
 */
export async function cropForIdentification(
  original: Buffer,
  crop: CropRect | null | undefined,
): Promise<Buffer> {
  // rotate() so fractions line up with what the keeper saw; harmless if the
  // stored original is already upright.
  const { data, info } = await sharp(original).rotate().toBuffer({ resolveWithObject: true });
  const left = crop ? Math.round(crop.x * info.width) : 0;
  const top = crop ? Math.round(crop.y * info.height) : 0;
  const width = crop ? Math.min(Math.round(crop.w * info.width), info.width - left) : info.width;
  const height = crop ? Math.min(Math.round(crop.h * info.height), info.height - top) : info.height;
  if (Math.min(width, height) < MIN_CROP_PX) {
    // Logged to help tune MIN_CROP_PX against real photos.
    console.warn(
      `[species] crop too small: ${width}x${height}px (min side ${MIN_CROP_PX}) of ${info.width}x${info.height}px photo` +
        (crop
          ? `, rect x=${crop.x.toFixed(3)} y=${crop.y.toFixed(3)} w=${crop.w.toFixed(3)} h=${crop.h.toFixed(3)}`
          : ", whole photo"),
    );
    throw new SpeciesError(
      422,
      "That area is too small to identify. Try a closer photo, or draw a larger rectangle.",
    );
  }
  return sharp(data)
    .extract({ left, top, width, height })
    .resize({
      width: SEND_MAX_LONG_EDGE_PX,
      height: SEND_MAX_LONG_EDGE_PX,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 85 })
    .toBuffer();
}

// --- identify -------------------------------------------------------------

async function loadOwnPhoto(observationId: string, photoId: string) {
  const [photo] = await db
    .select({ photoId: photos.photoId, storageKey: photos.storageKey })
    .from(photos)
    .where(and(eq(photos.photoId, photoId), eq(photos.observationId, observationId)))
    .limit(1);
  if (!photo) throw new SpeciesError(404, "Photo not found on this observation.");
  // Pasted external URLs have no object of ours to read; fetching arbitrary
  // user-supplied URLs server-side isn't worth the risk for this.
  if (!photo.storageKey) {
    throw new SpeciesError(
      422,
      "Identification needs an uploaded photo. You can still enter the species by name.",
    );
  }
  return { storageKey: photo.storageKey };
}

export async function identifyPhoto(
  authContext: AuthContext,
  observationId: string,
  input: IdentifyRequest,
): Promise<IdentifyResult> {
  await requireIdentifiableObservation(authContext, observationId);
  const photo = await loadOwnPhoto(observationId, input.photoId);
  // System admins are exempt from our limits. Their calls still count toward
  // the overall daily total that everyone else is checked against.
  if (!authContext.isSystemAdmin) await assertQuota(authContext.userId, observationId);

  let original: Buffer;
  try {
    original = await readObject(photo.storageKey);
  } catch (error) {
    console.error("[species] failed to read photo", error);
    throw new SpeciesError(503, "Identification is unavailable right now.");
  }
  // May throw the "too small" 422 -- before any quota is consumed.
  const image = await cropForIdentification(original, input.crop);

  const outcome = await callPlantNet(image, input.organ);
  const failed = outcome.status !== 404 && !(outcome.status >= 200 && outcome.status < 300);

  const candidates = failed
    ? []
    : (outcome.body?.results ?? [])
        .filter((r) => r.score >= MIN_CANDIDATE_SCORE && r.species?.scientificNameWithoutAuthor)
        .slice(0, MAX_CANDIDATES);

  // Recorded even on failure: the call may have used Pl@ntNet quota.
  const identificationId = await db.transaction(async (tx) => {
    const [ident] = await tx
      .insert(identifications)
      .values({
        observationId,
        photoId: input.photoId,
        userId: authContext.userId,
        ...cropColumns(input.crop),
        plantnetStatus: outcome.status,
      })
      .returning({ id: identifications.identificationId });
    for (const result of candidates) {
      const gbif = Number(result.gbif?.id);
      const taxon = await upsertTaxon(tx, {
        gbifKey: Number.isSafeInteger(gbif) && gbif > 0 ? gbif : null,
        scientificName: result.species.scientificNameWithoutAuthor,
        commonName: result.species.commonNames?.[0] ?? null,
        family: result.species.family?.scientificNameWithoutAuthor ?? null,
      });
      await tx
        .insert(observationPlants)
        .values({
          identificationId: ident.id,
          observationId,
          taxonId: taxon.taxonId,
          source: "plantnet",
          score: result.score,
          status: "suggested",
          rawResult: result,
        })
        // Two results can resolve to one taxon; keep the first (best) one.
        .onConflictDoNothing();
    }
    return ident.id;
  });

  if (failed) {
    console.warn("[species] plantnet failed with status", outcome.status);
    throw new SpeciesError(502, "Identification is unavailable right now. Please try again later.");
  }

  const identification = await getIdentification(identificationId);
  return {
    identification: identification!,
    noMatch: candidates.length === 0,
    remainingRequests: outcome.body?.remainingIdentificationRequests ?? null,
  };
}

// --- confirm / reject / manual -------------------------------------------

async function loadPlantForDecision(identificationId: string, observationPlantId: string) {
  const [row] = await db
    .select({
      observationPlantId: observationPlants.observationPlantId,
      observationId: identifications.observationId,
    })
    .from(observationPlants)
    .innerJoin(
      identifications,
      eq(observationPlants.identificationId, identifications.identificationId),
    )
    .where(
      and(
        eq(observationPlants.observationPlantId, observationPlantId),
        eq(observationPlants.identificationId, identificationId),
      ),
    )
    .limit(1);
  if (!row) throw new SpeciesError(404, "Not found");
  return row;
}

/**
 * Marks one candidate verified and every sibling rejected, in one
 * transaction. Siblings are demoted first: at most one verified row may exist
 * per identification (partial unique index), which also makes re-confirming a
 * different candidate a clean switch.
 */
export async function confirmCandidate(
  authContext: AuthContext,
  identificationId: string,
  observationPlantId: string,
): Promise<Identification> {
  const row = await loadPlantForDecision(identificationId, observationPlantId);
  await requireIdentifiableObservation(authContext, row.observationId);
  await db.transaction(async (tx) => {
    await tx
      .update(observationPlants)
      .set({ status: "rejected", verifiedBy: null, verifiedAt: null })
      .where(
        and(
          eq(observationPlants.identificationId, identificationId),
          ne(observationPlants.observationPlantId, observationPlantId),
          ne(observationPlants.status, "rejected"),
        ),
      );
    await tx
      .update(observationPlants)
      .set({ status: "verified", verifiedBy: authContext.userId, verifiedAt: new Date() })
      .where(eq(observationPlants.observationPlantId, observationPlantId));
  });
  return (await getIdentification(identificationId))!;
}

export async function rejectCandidate(
  authContext: AuthContext,
  identificationId: string,
  observationPlantId: string,
): Promise<Identification> {
  const row = await loadPlantForDecision(identificationId, observationPlantId);
  await requireIdentifiableObservation(authContext, row.observationId);
  await db
    .update(observationPlants)
    .set({ status: "rejected", verifiedBy: null, verifiedAt: null })
    .where(eq(observationPlants.observationPlantId, observationPlantId));
  return (await getIdentification(identificationId))!;
}

/**
 * A keeper-typed name: an identification with no Pl@ntNet call
 * (plantnetStatus null, so it never counts against quota) and one verified
 * 'keeper' row.
 */
export async function createManualIdentification(
  authContext: AuthContext,
  observationId: string,
  input: ManualSpeciesRequest,
): Promise<Identification> {
  await requireIdentifiableObservation(authContext, observationId);
  const [photo] = await db
    .select({ photoId: photos.photoId })
    .from(photos)
    .where(and(eq(photos.photoId, input.photoId), eq(photos.observationId, observationId)))
    .limit(1);
  if (!photo) throw new SpeciesError(404, "Photo not found on this observation.");

  const identificationId = await db.transaction(async (tx) => {
    const taxon = await upsertTaxon(tx, {
      gbifKey: null,
      scientificName: input.scientificName,
      commonName: input.commonName || null,
      family: null,
    });
    const [ident] = await tx
      .insert(identifications)
      .values({
        observationId,
        photoId: input.photoId,
        userId: authContext.userId,
        ...cropColumns(input.crop),
        plantnetStatus: null,
      })
      .returning({ id: identifications.identificationId });
    await tx.insert(observationPlants).values({
      identificationId: ident.id,
      observationId,
      taxonId: taxon.taxonId,
      source: "keeper",
      status: "verified",
      verifiedBy: authContext.userId,
      verifiedAt: new Date(),
    });
    return ident.id;
  });
  return (await getIdentification(identificationId))!;
}

// --- reads ----------------------------------------------------------------

async function loadIdentifications(where: SQL | undefined): Promise<Identification[]> {
  const idents = await db
    .select()
    .from(identifications)
    .where(where)
    .orderBy(asc(identifications.createdAt));
  if (idents.length === 0) return [];
  const plantRows = await db
    .select({ plant: observationPlants, taxon: taxa })
    .from(observationPlants)
    .innerJoin(taxa, eq(observationPlants.taxonId, taxa.taxonId))
    .where(
      inArray(
        observationPlants.identificationId,
        idents.map((i) => i.identificationId),
      ),
    );
  const byIdent = new Map<string, ObservationPlant[]>();
  for (const { plant, taxon } of plantRows) {
    const list = byIdent.get(plant.identificationId) ?? [];
    list.push({
      observationPlantId: plant.observationPlantId,
      taxon: toTaxon(taxon),
      source: plant.source as PlantSource,
      score: plant.score,
      status: plant.status as PlantStatus,
    });
    byIdent.set(plant.identificationId, list);
  }
  const rank: Record<PlantStatus, number> = { verified: 0, suggested: 1, rejected: 2 };
  return idents.map((i) => ({
    identificationId: i.identificationId,
    observationId: i.observationId,
    photoId: i.photoId,
    crop:
      i.cropX !== null && i.cropY !== null && i.cropW !== null && i.cropH !== null
        ? { x: i.cropX, y: i.cropY, w: i.cropW, h: i.cropH }
        : null,
    createdAt: i.createdAt.toISOString(),
    plants: (byIdent.get(i.identificationId) ?? []).sort(
      (a, b) => rank[a.status] - rank[b.status] || (b.score ?? 0) - (a.score ?? 0),
    ),
  }));
}

export async function getIdentification(identificationId: string): Promise<Identification | null> {
  const [found] = await loadIdentifications(eq(identifications.identificationId, identificationId));
  return found ?? null;
}

/**
 * Identifications for an observation. Ones with no candidate rows (a failed
 * or no-match Pl@ntNet call kept only for quota counting) are left out.
 */
export async function listIdentifications(observationId: string): Promise<Identification[]> {
  const all = await loadIdentifications(eq(identifications.observationId, observationId));
  return all.filter((i) => i.plants.length > 0);
}

/** Per-observation counts of live (not rejected) plant rows, for the card button. */
export async function speciesCountsByObservation(
  observationIds: string[],
): Promise<Map<string, SpeciesCounts>> {
  const result = new Map<string, SpeciesCounts>();
  if (observationIds.length === 0) return result;
  const rows = await db
    .select({
      observationId: observationPlants.observationId,
      status: observationPlants.status,
      n: count(),
    })
    .from(observationPlants)
    .where(
      and(
        inArray(observationPlants.observationId, observationIds),
        ne(observationPlants.status, "rejected"),
      ),
    )
    .groupBy(observationPlants.observationId, observationPlants.status);
  for (const row of rows) {
    const entry = result.get(row.observationId) ?? { verified: 0, suggested: 0 };
    if (row.status === "verified") entry.verified = row.n;
    else entry.suggested = row.n;
    result.set(row.observationId, entry);
  }
  return result;
}

// --- spot_taxa view -------------------------------------------------------

/** Rebuilds the spot_taxa materialized view (migration 0014). Safe to call often. */
export async function refreshSpotTaxa(): Promise<void> {
  await db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY spot_taxa`);
}

export type SpotTaxonRow = {
  taxon: Taxon;
  firstSeen: string;
  lastSeen: string;
  observationCount: number;
};

/** What grows at a spot: verified plants with first/last seen dates. */
export async function listTaxaForSpot(spotId: number): Promise<SpotTaxonRow[]> {
  const result = await db.execute<{
    taxon_id: string;
    scientific_name: string;
    common_name: string | null;
    family: string | null;
    first_seen: string;
    last_seen: string;
    observation_count: number;
  }>(sql`
    SELECT t.taxon_id, t.scientific_name, t.common_name, t.family,
           st.first_seen, st.last_seen, st.observation_count
    FROM spot_taxa st JOIN taxa t ON t.taxon_id = st.taxon_id
    WHERE st.spot_id = ${spotId}
    ORDER BY t.scientific_name`);
  return result.rows.map((r) => ({
    taxon: {
      taxonId: r.taxon_id,
      scientificName: r.scientific_name,
      commonName: r.common_name,
      family: r.family,
    },
    firstSeen: String(r.first_seen),
    lastSeen: String(r.last_seen),
    observationCount: r.observation_count,
  }));
}

export type TaxonSpotRow = {
  spotId: number;
  spotName: string;
  firstSeen: string;
  lastSeen: string;
  observationCount: number;
};

/** Which spots have this plant. */
export async function listSpotsForTaxon(taxonId: string): Promise<{
  taxon: Taxon;
  spots: TaxonSpotRow[];
} | null> {
  const [taxon] = await db.select().from(taxa).where(eq(taxa.taxonId, taxonId)).limit(1);
  if (!taxon) return null;
  const result = await db.execute<{
    spot_id: number;
    name: string;
    first_seen: string;
    last_seen: string;
    observation_count: number;
  }>(sql`
    SELECT st.spot_id, s.name, st.first_seen, st.last_seen, st.observation_count
    FROM spot_taxa st JOIN spots s ON s.spot_id = st.spot_id
    WHERE st.taxon_id = ${taxonId}
    ORDER BY st.last_seen DESC`);
  return {
    taxon: toTaxon(taxon),
    spots: result.rows.map((r) => ({
      spotId: r.spot_id,
      spotName: r.name,
      firstSeen: String(r.first_seen),
      lastSeen: String(r.last_seen),
      observationCount: r.observation_count,
    })),
  };
}
