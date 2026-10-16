import { db, externalIdentities } from "@placekeeping/db";
import { encryptToken } from "./tokenCrypto";

const AUTHORIZE_URL = "https://app.asana.com/-/oauth_authorize";
const TOKEN_URL = "https://app.asana.com/-/oauth_token";
const API_BASE = "https://app.asana.com/api/1.0";

function credentials() {
  const clientId = process.env.ASANA_CLIENT_ID;
  const clientSecret = process.env.ASANA_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("ASANA_CLIENT_ID / ASANA_CLIENT_SECRET are not set");
  }
  return { clientId, clientSecret };
}

// Granular scopes for what the integration calls: tasks (create, read,
// section add), comments (stories), external photo attachments, project and
// section browsing, and workspace/user lookup at connect time. These must also
// be enabled under OAuth > Permission Scopes in the Asana developer console,
// or Asana rejects the authorization with forbidden_scopes. Set
// ASANA_OAUTH_SCOPES to override (space-separated), or to "default" to request
// no scope parameter (only valid if the app has Full permissions enabled).
const DEFAULT_SCOPES = [
  "tasks:read",
  "tasks:write",
  "stories:read",
  "stories:write",
  "attachments:write",
  "projects:read",
  "workspaces:read",
  "users:read",
];

function requestedScopes(): string | null {
  const override = process.env.ASANA_OAUTH_SCOPES?.trim();
  if (override === "default") return null;
  return override || DEFAULT_SCOPES.join(" ");
}

export function buildAsanaAuthorizeUrl(redirectUri: string, state: string) {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", credentials().clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  const scope = requestedScopes();
  if (scope) url.searchParams.set("scope", scope);
  return url.toString();
}

type AsanaTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  data?: { id: string | number; name?: string };
};

async function fetchAsanaMe(accessToken: string) {
  const res = await fetch(
    `${API_BASE}/users/me?opt_fields=gid,name,workspaces.gid,workspaces.name`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) throw new Error(`Asana /users/me failed: ${res.status}`);
  const { data } = (await res.json()) as {
    data: {
      gid: string;
      name: string;
      workspaces: { gid: string; name: string }[];
    };
  };
  return data;
}

/**
 * Exchanges the OAuth code, looks up the Asana user and their workspaces, and
 * upserts one external_identities row per workspace (the same token serves
 * all of them). Returns the workspaces linked.
 */
export async function completeAsanaConnection(params: {
  userId: string;
  code: string;
  redirectUri: string;
}) {
  const { clientId, clientSecret } = credentials();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: params.redirectUri,
      code: params.code,
    }),
  });
  if (!res.ok) throw new Error(`Asana token exchange failed: ${res.status}`);
  const token = (await res.json()) as AsanaTokenResponse;

  const me = await fetchAsanaMe(token.access_token);
  const encryptedAccessToken = encryptToken(token.access_token);
  const encryptedRefreshToken = token.refresh_token
    ? encryptToken(token.refresh_token)
    : null;
  const accessTokenExpiresAt = token.expires_in
    ? new Date(Date.now() + token.expires_in * 1000)
    : null;

  for (const ws of me.workspaces) {
    const values = {
      userId: params.userId,
      system: "asana",
      remoteWorkspaceId: ws.gid,
      remoteWorkspaceName: ws.name,
      remoteUserId: me.gid,
      remoteUserName: me.name,
      encryptedAccessToken,
      encryptedRefreshToken,
      accessTokenExpiresAt,
      status: "active",
    };
    await db
      .insert(externalIdentities)
      .values(values)
      .onConflictDoUpdate({
        target: [
          externalIdentities.userId,
          externalIdentities.system,
          externalIdentities.remoteWorkspaceId,
          externalIdentities.remoteUserId,
        ],
        set: { ...values, updatedAt: new Date() },
      });
  }
  return me.workspaces;
}
