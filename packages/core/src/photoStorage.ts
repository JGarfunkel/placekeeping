import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { logRemoteCall } from "./remoteLog";

export type ImageStorageBackend = "r2" | "s3" | "gcs" | "local";
export type StoredPhoto = { url: string; key: string };

const CONTENT_TYPE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function buildObjectKey(contentType: string): string {
  const extension = CONTENT_TYPE_EXTENSIONS[contentType] ?? "bin";
  return `${randomUUID()}.${extension}`;
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

async function uploadToR2(bytes: Buffer, contentType: string): Promise<StoredPhoto> {
  const bucket = requireEnv("R2_BUCKET_NAME");
  const publicBaseUrl = requireEnv("R2_PUBLIC_BASE_URL");
  const key = buildObjectKey(contentType);

  await logRemoteCall("r2", "putObject", () =>
    getR2Client().send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: bytes,
        ContentType: contentType,
      }),
    ),
  );

  return { url: `${publicBaseUrl}/${key}`, key };
}

/**
 * Writes to apps/web/public/uploads, assuming process.cwd() is apps/web —
 * true for `npm run dev -w apps/web` / `next start` invoked from there.
 * Dev/testing only: not durable across redeploys on most hosts.
 */
async function uploadToLocal(bytes: Buffer, contentType: string): Promise<StoredPhoto> {
  const baseUrl = requireEnv("LOCAL_UPLOADS_BASE_URL");
  const key = buildObjectKey(contentType);
  const uploadsDir = path.resolve(process.cwd(), "public", "uploads");

  await mkdir(uploadsDir, { recursive: true });
  await writeFile(path.join(uploadsDir, key), bytes);

  return { url: `${baseUrl}/uploads/${key}`, key };
}

export async function storePhoto(bytes: Buffer, contentType: string): Promise<StoredPhoto> {
  const backend = getBackend();
  switch (backend) {
    case "r2":
      return uploadToR2(bytes, contentType);
    case "local":
      return uploadToLocal(bytes, contentType);
    case "s3":
    case "gcs":
      throw new Error(`IMAGE_STORAGE="${backend}" is not implemented yet`);
  }
}

/**
 * The object key for a URL pointing at storage we control, or null for an
 * externally pasted URL. Permissive by design: never throws, and if a
 * base-URL env var changes later, old URLs simply stop matching rather than
 * breaking.
 */
export function ownStorageKey(url: string): string | null {
  const bases = [process.env.R2_PUBLIC_BASE_URL, process.env.LOCAL_UPLOADS_BASE_URL].filter(
    (base): base is string => Boolean(base),
  );
  for (const base of bases) {
    const prefix = `${base}/`;
    if (url.startsWith(prefix)) return url.slice(prefix.length);
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
