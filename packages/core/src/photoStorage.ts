import { randomUUID } from "node:crypto";
import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { PhotoVariants } from "@placekeeping/db";
import { processPhoto, type DerivedImage, type ProcessedPhoto } from "./photoResize";
import { logRemoteCall } from "./remoteLog";

export type ImageStorageBackend = "r2" | "s3" | "gcs" | "local";

export type PhotoVariant = "original" | "medium" | "thumb";

/**
 * Objects are overwritten in place on admin replace/regenerate, so keep this
 * short: the raw `url` (no ?v= cache buster) can be stale for this long after
 * a replace. Raise to a year + immutable once nothing reads the raw url.
 */
const CACHE_CONTROL = "public, max-age=86400";

/** Object key for one variant of a photo, given its original's key. */
export function variantKey(storageKey: string, variant: PhotoVariant): string {
  if (variant === "original") return storageKey;
  const dot = storageKey.lastIndexOf(".");
  const base = dot === -1 ? storageKey : storageKey.slice(0, dot);
  return `${base}_${variant}.webp`;
}

export function allKeys(storageKey: string): string[] {
  return [
    variantKey(storageKey, "original"),
    variantKey(storageKey, "medium"),
    variantKey(storageKey, "thumb"),
  ];
}

function getBackend(): ImageStorageBackend {
  const value = process.env.IMAGE_STORAGE;
  if (value === "r2" || value === "s3" || value === "gcs" || value === "local") {
    return value;
  }
  throw new Error(
    `IMAGE_STORAGE must be one of "r2", "s3", "gcs", "local" — got ${JSON.stringify(value)}`,
  );
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

let r2Client: S3Client;

function getR2Client(): S3Client {
  if (r2Client) return r2Client;

  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "R2 env vars missing: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY",
    );
  }

  r2Client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return r2Client;
}

/** Public read origin for the active backend, without a trailing slash. */
function publicBase(backend: ImageStorageBackend): string {
  switch (backend) {
    case "r2":
      return requireEnv("R2_PUBLIC_BASE_URL");
    case "local":
      return `${requireEnv("LOCAL_UPLOADS_BASE_URL")}/uploads`;
    case "s3":
    case "gcs":
      throw new Error(`IMAGE_STORAGE="${backend}" is not implemented yet`);
  }
}

/** Public URL for an object key in the active storage backend. */
export function publicUrlFor(key: string): string {
  return `${publicBase(getBackend())}/${key}`;
}

/**
 * Local backend writes to apps/web/public/uploads, assuming process.cwd() is
 * apps/web -- true for `npm run dev -w apps/web` / `next start` invoked from
 * there. Dev/testing only: not durable across redeploys on most hosts.
 */
function localUploadsDir(): string {
  return path.resolve(process.cwd(), "public", "uploads");
}

async function putObject(key: string, bytes: Buffer, contentType: string): Promise<void> {
  const backend = getBackend();
  switch (backend) {
    case "r2":
      await logRemoteCall("r2", "putObject", () =>
        getR2Client().send(
          new PutObjectCommand({
            Bucket: requireEnv("R2_BUCKET_NAME"),
            Key: key,
            Body: bytes,
            ContentType: contentType,
            CacheControl: CACHE_CONTROL,
          }),
        ),
      );
      return;
    case "local":
      await mkdir(localUploadsDir(), { recursive: true });
      await writeFile(path.join(localUploadsDir(), key), bytes);
      return;
    case "s3":
    case "gcs":
      throw new Error(`IMAGE_STORAGE="${backend}" is not implemented yet`);
  }
}

async function deleteObject(key: string): Promise<void> {
  const backend = getBackend();
  switch (backend) {
    case "r2":
      await logRemoteCall("r2", "deleteObject", () =>
        getR2Client().send(
          new DeleteObjectCommand({ Bucket: requireEnv("R2_BUCKET_NAME"), Key: key }),
        ),
      );
      return;
    case "local":
      await unlink(path.join(localUploadsDir(), key)).catch((err) => {
        if (err?.code !== "ENOENT") throw err;
      });
      return;
    case "s3":
    case "gcs":
      throw new Error(`IMAGE_STORAGE="${backend}" is not implemented yet`);
  }
}

/** Reads a stored object's bytes. Throws if it doesn't exist. */
export async function readObject(key: string): Promise<Buffer> {
  const backend = getBackend();
  switch (backend) {
    case "r2": {
      const result = await logRemoteCall("r2", "getObject", () =>
        getR2Client().send(
          new GetObjectCommand({ Bucket: requireEnv("R2_BUCKET_NAME"), Key: key }),
        ),
      );
      if (!result.Body) throw new Error(`Empty object body for ${key}`);
      return Buffer.from(await result.Body.transformToByteArray());
    }
    case "local":
      return readFile(path.join(localUploadsDir(), key));
    case "s3":
    case "gcs":
      throw new Error(`IMAGE_STORAGE="${backend}" is not implemented yet`);
  }
}

async function objectExists(key: string): Promise<boolean> {
  const backend = getBackend();
  switch (backend) {
    case "r2":
      try {
        await logRemoteCall("r2", "headObject", () =>
          getR2Client().send(
            new HeadObjectCommand({ Bucket: requireEnv("R2_BUCKET_NAME"), Key: key }),
          ),
        );
        return true;
      } catch (err) {
        if ((err as { name?: string })?.name === "NotFound") return false;
        throw err;
      }
    case "local":
      return stat(path.join(localUploadsDir(), key)).then(
        () => true,
        () => false,
      );
    case "s3":
    case "gcs":
      throw new Error(`IMAGE_STORAGE="${backend}" is not implemented yet`);
  }
}

/** Whether the original, medium and thumb objects all exist for a photo. */
export async function allVariantObjectsExist(storageKey: string): Promise<boolean> {
  const results = await Promise.all(allKeys(storageKey).map(objectExists));
  return results.every(Boolean);
}

/**
 * Best-effort delete: a leftover object is harmless, so failures are logged
 * and swallowed rather than failing the caller's operation.
 */
export async function deleteObjects(keys: string[]): Promise<void> {
  const results = await Promise.allSettled(keys.map(deleteObject));
  results.forEach((result, i) => {
    if (result.status === "rejected") {
      console.warn("[photo-storage] failed to delete", keys[i], result.reason);
    }
  });
}

export function buildVariants(processed: ProcessedPhoto): PhotoVariants {
  const { original, medium, thumb } = processed;
  return {
    original: { w: original.w, h: original.h, bytes: original.buffer.length, mime: original.mime },
    medium: { w: medium.w, h: medium.h, bytes: medium.buffer.length },
    thumb: { w: thumb.w, h: thumb.h, bytes: thumb.buffer.length },
  };
}

/**
 * Writes the original, medium and thumb objects for `storageKey` (the
 * original's key; the others derive from it). Overwrites existing objects.
 * With cleanupOnFailure (new uploads), a partial failure deletes whatever
 * did get written; leave it off when overwriting an existing photo, where
 * deleting would remove the previous good copy.
 */
export async function putVariantObjects(
  storageKey: string,
  processed: ProcessedPhoto,
  { cleanupOnFailure = true }: { cleanupOnFailure?: boolean } = {},
): Promise<void> {
  const writes: Array<[string, Buffer, string]> = [
    [variantKey(storageKey, "original"), processed.original.buffer, processed.original.mime],
    [variantKey(storageKey, "medium"), processed.medium.buffer, "image/webp"],
    [variantKey(storageKey, "thumb"), processed.thumb.buffer, "image/webp"],
  ];
  const results = await Promise.allSettled(
    writes.map(([key, bytes, contentType]) => putObject(key, bytes, contentType)),
  );
  const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
  if (!failed) return;
  if (cleanupOnFailure) {
    await deleteObjects(
      writes.filter((_, i) => results[i].status === "fulfilled").map(([key]) => key),
    );
  }
  throw failed.reason;
}

/**
 * Writes only the medium and thumb copies for an existing photo (regenerate).
 * Overwrites in place; a partial failure leaves a mix of old and new, which
 * re-running fixes.
 */
export async function putDerivedObjects(
  storageKey: string,
  derived: { medium: DerivedImage; thumb: DerivedImage },
): Promise<void> {
  await Promise.all([
    putObject(variantKey(storageKey, "medium"), derived.medium.buffer, "image/webp"),
    putObject(variantKey(storageKey, "thumb"), derived.thumb.buffer, "image/webp"),
  ]);
}

export type StoredPhotoWithVariants = {
  storageKey: string;
  url: string;
  variants: PhotoVariants;
  sizeBytes: number;
};

/**
 * Processes an uploaded photo and stores the original plus medium and thumb
 * copies under a fresh key stem. `url` is the original's public URL. Runs
 * before any observation/photos row exists (see POST /api/photos), so the
 * stem is a random UUID rather than a photoId.
 */
export async function storePhotoWithVariants(args: {
  input: Buffer;
}): Promise<StoredPhotoWithVariants> {
  const processed = await processPhoto(args.input);
  const storageKey = `${randomUUID()}.${processed.original.ext}`;
  await putVariantObjects(storageKey, processed);
  return {
    storageKey,
    url: publicUrlFor(storageKey),
    variants: buildVariants(processed),
    sizeBytes: processed.original.buffer.length,
  };
}

/**
 * The object key for a URL pointing at storage we control, or null for an
 * externally pasted URL. Permissive by design: never throws, and if a
 * base-URL env var changes later, old URLs simply stop matching rather than
 * breaking. Any ?query (the ?v= cache buster) is ignored.
 */
export function ownStorageKey(url: string): string | null {
  const bases = [
    process.env.R2_PUBLIC_BASE_URL,
    process.env.LOCAL_UPLOADS_BASE_URL ? `${process.env.LOCAL_UPLOADS_BASE_URL}/uploads` : undefined,
  ].filter((base): base is string => Boolean(base));
  for (const base of bases) {
    const prefix = `${base}/`;
    if (url.startsWith(prefix)) return url.slice(prefix.length).split("?")[0];
  }
  return null;
}

/**
 * Whether a URL points at storage we control (already moderated at upload
 * time), vs. an externally pasted URL that still needs URL-fetch moderation.
 */
export function isOwnStorageUrl(url: string): boolean {
  return ownStorageKey(url) !== null;
}
