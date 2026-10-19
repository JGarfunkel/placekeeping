import { ImageAnnotatorClient } from "@google-cloud/vision";
import { Filter } from "bad-words";
import { debugLog } from "./debug";
import { isFetchablePhotoUrl } from "./photoMetadata";
import { logRemoteCall } from "./remoteLog";

const MODERATION_TIMEOUT_MS = 6000;

const LIKELIHOOD_RANK: Record<string, number> = {
  UNKNOWN: 0,
  VERY_UNLIKELY: 1,
  UNLIKELY: 2,
  POSSIBLE: 3,
  LIKELY: 4,
  VERY_LIKELY: 5,
};

function likelihoodRank(value: string | number | null | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return LIKELIHOOD_RANK[value] ?? 0;
  return 0;
}

export type PhotoModerationMode = "google" | "none";

export function getModerationMode(): PhotoModerationMode {
  const value = process.env.PHOTO_MODERATION ?? "none";
  if (value === "google" || value === "none") return value;
  throw new Error(
    `PHOTO_MODERATION must be "google" or "none" — got ${JSON.stringify(value)}`,
  );
}

/**
 * Users whose level is above PHOTO_MODERATION_USER_LEVEL_MAX (e.g. 2 =
 * trusted, with the max set to 1) skip moderation, which saves Vision costs
 * on photos from people we already vouch for. Unset or non-numeric means
 * nobody is exempt; an unknown level (null/undefined) is never exempt.
 */
export function isModerationExemptLevel(
  userLevel: number | null | undefined,
): boolean {
  if (userLevel == null) return false;
  const raw = process.env.PHOTO_MODERATION_USER_LEVEL_MAX;
  if (raw === undefined || raw.trim() === "") return false;
  const max = Number(raw);
  if (!Number.isFinite(max)) {
    throw new Error(
      `PHOTO_MODERATION_USER_LEVEL_MAX must be a number — got ${JSON.stringify(raw)}`,
    );
  }
  return userLevel > max;
}

/**
 * The photos.moderationStatus to record for a photo saved by this user:
 * "skipped" whenever no check actually ran (mode none, or exempt level).
 */
export function moderationStatusFor(
  userLevel: number | null | undefined,
): "skipped" | "approved" {
  return getModerationMode() === "none" || isModerationExemptLevel(userLevel)
    ? "skipped"
    : "approved";
}

export type PhotoModerationReason =
  | "unfetchable_url"
  | "unsafe_content"
  | "profane_text"
  | "moderation_unavailable";

export class PhotoModerationError extends Error {
  constructor(
    readonly url: string,
    readonly reason: PhotoModerationReason,
  ) {
    super(`Photo failed moderation (${reason}): ${url}`);
    this.name = "PhotoModerationError";
  }
}

let client: ImageAnnotatorClient;

function getVisionClient(): ImageAnnotatorClient {
  if (client) return client;

  const projectId = process.env.GOOGLE_VISION_PROJECT_ID;
  const clientEmail = process.env.GOOGLE_VISION_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_VISION_PRIVATE_KEY?.replace(
    /\\n/g,
    "\n",
  );

  if (Boolean(clientEmail) !== Boolean(privateKey)) {
    throw new Error(
      "Google Vision env vars incomplete: set both GOOGLE_VISION_CLIENT_EMAIL and GOOGLE_VISION_PRIVATE_KEY, or neither to use Application Default Credentials",
    );
  }

  // Explicit service-account key when provided; otherwise Application Default
  // Credentials (the Cloud Run runtime service account in production, or
  // `gcloud auth application-default login` locally).
  client = new ImageAnnotatorClient({
    ...(projectId ? { projectId } : {}),
    ...(clientEmail && privateKey
      ? { credentials: { client_email: clientEmail, private_key: privateKey } }
      : {}),
  });
  return client;
}

const profanityFilter = new Filter();

async function annotateAndEvaluate(
  image: { source: { imageUri: string } } | { content: Buffer },
  subject: string,
): Promise<void> {
  const timeout = new Promise<never>((_resolve, reject) => {
    setTimeout(() => {
      reject(new Error("Vision annotateImage timed out"));
    }, MODERATION_TIMEOUT_MS);
  });

  let response;
  try {
    debugLog("[photo-moderation] checking:", subject);
    [response] = await Promise.race([
      logRemoteCall("google-vision", "annotateImage", () =>
        getVisionClient().annotateImage({
          image,
          features: [
            { type: "SAFE_SEARCH_DETECTION" },
            { type: "TEXT_DETECTION" },
          ],
        }),
      ),
      timeout,
    ]);
  } catch (error) {
    console.error("[photo-moderation] Vision call failed:", subject, error);
    throw new PhotoModerationError(subject, "moderation_unavailable");
  }

  if (response.error) {
    console.error(
      "[photo-moderation] Vision returned a per-image error:",
      subject,
      response.error,
    );
    throw new PhotoModerationError(subject, "moderation_unavailable");
  }

  const safeSearch = response.safeSearchAnnotation;
  const isUnsafe =
    likelihoodRank(safeSearch?.adult) >= LIKELIHOOD_RANK.POSSIBLE ||
    likelihoodRank(safeSearch?.violence) >= LIKELIHOOD_RANK.POSSIBLE ||
    likelihoodRank(safeSearch?.medical) >= LIKELIHOOD_RANK.LIKELY ||
    likelihoodRank(safeSearch?.spoof) >= LIKELIHOOD_RANK.POSSIBLE ||
    likelihoodRank(safeSearch?.racy) >= LIKELIHOOD_RANK.POSSIBLE;
  if (isUnsafe) {
    console.warn("[photo-moderation] unsafe content detected:", subject, safeSearch);
    throw new PhotoModerationError(subject, "unsafe_content");
  }

  const text = response.textAnnotations?.[0]?.description;
  if (text && profanityFilter.isProfane(text)) {
    console.warn("[photo-moderation] profane text detected:", subject);
    throw new PhotoModerationError(subject, "profane_text");
  }

  debugLog("[photo-moderation] passed:", subject);
}

async function checkPhotoUrl(url: string): Promise<void> {
  if (!isFetchablePhotoUrl(url)) {
    console.warn("[photo-moderation] rejected non-fetchable URL:", url);
    throw new PhotoModerationError(url, "unfetchable_url");
  }
  await annotateAndEvaluate({ source: { imageUri: url } }, url);
}

/**
 * Checks every photo URL for unsafe or profane content via Google Cloud
 * Vision, throwing PhotoModerationError on the first one that fails. Fails
 * closed: any Vision error or timeout is treated as a rejection, not a pass.
 * No-op when PHOTO_MODERATION=none (the default), or when `userLevel` is
 * above PHOTO_MODERATION_USER_LEVEL_MAX.
 */
export async function checkPhotoUrls(
  urls: string[],
  userLevel?: number | null,
): Promise<void> {
  if (getModerationMode() === "none") {
    debugLog("[photo-moderation] PHOTO_MODERATION=none, skipping", urls.length, "url(s)");
    return;
  }
  if (isModerationExemptLevel(userLevel)) {
    debugLog("[photo-moderation] exempt user level", userLevel, "skipping", urls.length, "url(s)");
    return;
  }
  await Promise.all(urls.map(checkPhotoUrl));
}

/**
 * Same check as checkPhotoUrls, but from raw bytes via Vision's inline
 * content mode — no fetch involved, so this works for content that isn't
 * reachable from Vision's servers (e.g. a local-dev upload). No-op when
 * PHOTO_MODERATION=none (the default), or when `userLevel` is above
 * PHOTO_MODERATION_USER_LEVEL_MAX.
 */
export async function checkPhotoBytes(
  bytes: Buffer,
  subject = "uploaded-file",
  userLevel?: number | null,
): Promise<void> {
  if (getModerationMode() === "none") {
    debugLog("[photo-moderation] PHOTO_MODERATION=none, skipping:", subject);
    return;
  }
  if (isModerationExemptLevel(userLevel)) {
    debugLog("[photo-moderation] exempt user level", userLevel, "skipping:", subject);
    return;
  }
  await annotateAndEvaluate({ content: bytes }, subject);
}
