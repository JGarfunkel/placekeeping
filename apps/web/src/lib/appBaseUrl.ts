import "server-only";

// The app's own production origin, used to build the continue-URL Firebase
// redirects to after a verification/password-reset link is clicked (see
// GO_LIVE_CHECKLIST.md's Resend section). Defaults to localhost so local dev
// works without setting it.
export function getAppBaseUrl(): string {
  return process.env.APP_BASE_URL ?? "http://localhost:3000";
}
