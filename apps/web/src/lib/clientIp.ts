import type { NextRequest } from "next/server";

// Cloud Run's front end appends the connecting client's address to
// X-Forwarded-For, so the entry that the trusted proxy added is the LAST one;
// anything earlier is client-supplied and spoofable. Null when unavailable
// (e.g. local dev), in which case per-IP limits are skipped.
export function getClientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (!forwarded) return null;
  const parts = forwarded.split(",").map((p) => p.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : null;
}
