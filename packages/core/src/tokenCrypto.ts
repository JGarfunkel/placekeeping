import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM for third-party OAuth tokens at rest. INTEGRATION_TOKEN_KEY is
// 32 bytes, base64 (generate with: openssl rand -base64 32). Output format is
// "v1.<iv>.<tag>.<ciphertext>" (base64url) so the scheme can be rotated.
function getKey(): Buffer {
  const raw = process.env.INTEGRATION_TOKEN_KEY;
  if (!raw) throw new Error("INTEGRATION_TOKEN_KEY is not set");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("INTEGRATION_TOKEN_KEY must be 32 bytes, base64-encoded");
  }
  return key;
}

export function encryptToken(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ct.toString("base64url"),
  ].join(".");
}

export function decryptToken(payload: string): string {
  const [version, iv, tag, ct] = payload.split(".");
  if (version !== "v1" || !iv || !tag || !ct) {
    throw new Error("Unrecognized encrypted token format");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getKey(),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ct, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
