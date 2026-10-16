import { db, externalIdentities } from "@placekeeping/db";
import { eq } from "drizzle-orm";
import { decryptToken, encryptToken } from "./tokenCrypto";

const API_BASE = "https://app.asana.com/api/1.0";
const TOKEN_URL = "https://app.asana.com/-/oauth_token";

export type ExternalIdentityRow = typeof externalIdentities.$inferSelect;

export class AsanaApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "AsanaApiError";
  }
}

// Asana access tokens last about an hour; refresh a minute early and persist
// the new token so every later call benefits.
async function getAccessToken(identity: ExternalIdentityRow): Promise<string> {
  const expiresAt = identity.accessTokenExpiresAt?.getTime() ?? Infinity;
  if (expiresAt - Date.now() > 60_000) {
    return decryptToken(identity.encryptedAccessToken);
  }
  if (!identity.encryptedRefreshToken) {
    throw new AsanaApiError(401, "Asana connection expired; reconnect Asana.");
  }
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: process.env.ASANA_CLIENT_ID ?? "",
      client_secret: process.env.ASANA_CLIENT_SECRET ?? "",
      refresh_token: decryptToken(identity.encryptedRefreshToken),
    }),
  });
  if (!res.ok) {
    await db
      .update(externalIdentities)
      .set({ status: "revoked", updatedAt: new Date() })
      .where(eq(externalIdentities.id, identity.id));
    throw new AsanaApiError(401, "Asana connection expired; reconnect Asana.");
  }
  const body = (await res.json()) as {
    access_token: string;
    expires_in?: number;
  };
  await db
    .update(externalIdentities)
    .set({
      encryptedAccessToken: encryptToken(body.access_token),
      accessTokenExpiresAt: body.expires_in
        ? new Date(Date.now() + body.expires_in * 1000)
        : null,
      updatedAt: new Date(),
    })
    .where(eq(externalIdentities.id, identity.id));
  return body.access_token;
}

// Calls the Asana REST API as the identity's user, so Asana's own project
// permissions apply. Unwraps the `{ data }` envelope.
export async function asanaRequest<T>(
  identity: ExternalIdentityRow,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const token = await getAccessToken(identity);
  const res = await fetch(`${API_BASE}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init?.body ? JSON.stringify({ data: init.body }) : undefined,
  });
  const json = (await res.json().catch(() => null)) as {
    data?: T;
    errors?: { message: string }[];
  } | null;
  if (!res.ok) {
    throw new AsanaApiError(
      res.status,
      json?.errors?.[0]?.message ?? `Asana request failed (${res.status})`,
    );
  }
  return json?.data as T;
}
