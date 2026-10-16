import "server-only";

import { getAppBaseUrl } from "@/lib/appBaseUrl";

// Feature flag: hides every Asana entry point (connect buttons, spot panel,
// binding editors) unless ENABLE_INTEGRATION_ASANA=true.
export function isAsanaEnabled(): boolean {
  return process.env.ENABLE_INTEGRATION_ASANA === "true";
}

export const ASANA_STATE_COOKIE = "asana_oauth_state";
export const ASANA_RETURN_COOKIE = "asana_oauth_return";
export const ASANA_COOKIE_PATH = "/";

// Only same-site relative paths, so the connect flow cannot be used as an
// open redirect.
export function safeReturnPath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null;
  if (value.includes("\\")) return null;
  return value;
}

// Must match the redirect URL registered in the Asana developer console.
export function asanaRedirectUri() {
  return `${getAppBaseUrl()}/oauth/asana/callback`;
}
