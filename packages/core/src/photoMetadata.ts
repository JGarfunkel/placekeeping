import exifr from "exifr";
import { debugLog } from "./debug";
import { logRemoteCall } from "./remoteLog";

const PARSE_TIMEOUT_MS = 6000;

function isPrivateOrLoopbackHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (lower === "localhost" || lower.endsWith(".localhost")) return true;
  if (lower === "0.0.0.0" || lower === "169.254.169.254" || lower === "::1") {
    return true;
  }
  const ipv4 = lower.match(/^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    if (a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  return false;
}

/** Only https URLs to non-private hosts are fetched server-side, to keep this from being an SSRF oracle. */
export function isFetchablePhotoUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return parsed.protocol === "https:" && !isPrivateOrLoopbackHost(parsed.hostname);
}

function toDateOnlyString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Best-effort read of a photo's capture date from its EXIF data, given a
 * URL. Returns null on any failure (unsupported host, no EXIF, timeout,
 * non-image content, etc.) rather than throwing, since this is only ever
 * used to pre-fill a form field the user can edit.
 */
export async function getPhotoObservedDate(url: string): Promise<string | null> {
  if (!isFetchablePhotoUrl(url)) {
    debugLog("[photo-metadata] rejected non-fetchable URL:", url);
    return null;
  }

  const timeout = new Promise<null>((resolve) => {
    setTimeout(() => {
      debugLog("[photo-metadata] EXIF parse timed out after", PARSE_TIMEOUT_MS, "ms:", url);
      resolve(null);
    }, PARSE_TIMEOUT_MS);
  });

  try {
    debugLog("[photo-metadata] fetching EXIF data:", url);
    const result = await Promise.race([
      logRemoteCall("photo-url", "exif-fetch", () =>
        exifr.parse(url, { pick: ["DateTimeOriginal", "CreateDate", "ModifyDate"] }),
      ),
      timeout,
    ]);
    debugLog("[photo-metadata] EXIF tags found:", result ? Object.keys(result) : result);
    const date = result?.DateTimeOriginal ?? result?.CreateDate ?? result?.ModifyDate;
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      debugLog("[photo-metadata] no usable date tag in EXIF data:", url);
      return null;
    }
    const observedAt = toDateOnlyString(date);
    debugLog("[photo-metadata] resolved observed date:", observedAt, "from", url);
    return observedAt;
  } catch (error) {
    debugLog("[photo-metadata] EXIF parse failed:", url, error);
    return null;
  }
}

/**
 * Same best-effort EXIF date read as getPhotoObservedDate, but from raw
 * bytes already in hand (an upload) instead of fetching a URL.
 */
export async function getPhotoObservedDateFromBytes(bytes: Buffer): Promise<string | null> {
  const timeout = new Promise<null>((resolve) => {
    setTimeout(() => {
      debugLog("[photo-metadata] EXIF parse timed out after", PARSE_TIMEOUT_MS, "ms (bytes)");
      resolve(null);
    }, PARSE_TIMEOUT_MS);
  });

  try {
    const result = await Promise.race([
      exifr.parse(bytes, { pick: ["DateTimeOriginal", "CreateDate", "ModifyDate"] }),
      timeout,
    ]);
    const date = result?.DateTimeOriginal ?? result?.CreateDate ?? result?.ModifyDate;
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      debugLog("[photo-metadata] no usable date tag in EXIF data (bytes)");
      return null;
    }
    const observedAt = toDateOnlyString(date);
    debugLog("[photo-metadata] resolved observed date (bytes):", observedAt);
    return observedAt;
  } catch (error) {
    debugLog("[photo-metadata] EXIF parse failed (bytes):", error);
    return null;
  }
}

/**
 * Best-effort read of a photo's GPS coordinates from its EXIF data, given
 * raw bytes already in hand (an upload). Returns null on any failure (no
 * GPS tags, timeout, non-image content, etc.) rather than throwing, since
 * this is only ever used to suggest nearby spots -- the user can always
 * fall back to a manual search.
 */
export async function getPhotoLocationFromBytes(
  bytes: Buffer,
): Promise<{ lat: number; lng: number } | null> {
  const timeout = new Promise<null>((resolve) => {
    setTimeout(() => {
      debugLog("[photo-metadata] GPS parse timed out after", PARSE_TIMEOUT_MS, "ms (bytes)");
      resolve(null);
    }, PARSE_TIMEOUT_MS);
  });

  try {
    const result = await Promise.race([exifr.gps(bytes), timeout]);
    if (
      !result ||
      typeof result.latitude !== "number" ||
      typeof result.longitude !== "number"
    ) {
      debugLog("[photo-metadata] no usable GPS tags in EXIF data (bytes)");
      return null;
    }
    return { lat: result.latitude, lng: result.longitude };
  } catch (error) {
    debugLog("[photo-metadata] GPS parse failed (bytes):", error);
    return null;
  }
}
