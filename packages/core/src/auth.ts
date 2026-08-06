import { OBSERVATION_EDIT_WINDOW_MS } from "@placekeeping/shared-types";
import { FirebaseAuthError } from "firebase-admin/auth";
import { sendPasswordResetEmail, sendVerificationEmail } from "./email";
import { adminAuth } from "./firebase-admin";
import { logRemoteCall } from "./remoteLog";
import { listStewardsAdministeredByUser } from "./stewardMembers";
import { getStewardByUserId } from "./stewards";
import { getUserByFirebaseUid } from "./users";

export type AuthContext = {
  firebaseUid: string;
  userId: string;
  isSystemAdmin: boolean;
  // The individual steward this user personally owns, if they've signed up
  // as one via "become a steward" -- null for users who haven't, and never
  // set for group stewards (those have no owning user).
  stewardId: string | null;
  // Group stewards this user administers -- lets canManageSpot below cover
  // a spot stewarded by a group the caller admins, not just their own
  // individual steward or a spot they personally created.
  administeredStewardIds: string[];
  // Frozen at session-cookie mint time (login), not live -- a user who
  // verifies mid-session won't see this flip until they log out/in again.
  emailVerified: boolean;
  // Verification/standing tier, live (unlike emailVerified above, this is
  // read fresh from users on every resolveAuth call, not cached in the
  // session cookie) -- see LEVEL_LABELS in @placekeeping/shared-types.
  level: number;
};

/**
 * Single identity resolver shared by every protected endpoint (and, later,
 * by a standalone mobile-facing API service): a bearer Firebase ID token
 * takes priority (the path a native app will use), falling back to a
 * server-issued session cookie (the path the web app uses).
 */
export async function resolveAuth(input: {
  bearerToken?: string | null;
  sessionCookie?: string | null;
}): Promise<AuthContext | null> {
  if (!input.bearerToken && !input.sessionCookie) return null;

  let firebaseUid: string;
  let emailVerified: boolean;
  try {
    const auth = adminAuth();
    if (input.bearerToken) {
      const decoded = await auth.verifyIdToken(input.bearerToken);
      firebaseUid = decoded.uid;
      emailVerified = decoded.email_verified ?? false;
    } else {
      const decoded = await auth.verifySessionCookie(
        input.sessionCookie!,
        true,
      );
      firebaseUid = decoded.uid;
      emailVerified = decoded.email_verified ?? false;
    }
  } catch (error) {
    if (!(error instanceof FirebaseAuthError)) {
      // Not a normal "bad/expired token" rejection (e.g. missing/invalid
      // admin credentials) -- surface it instead of just looking logged-out.
      console.error("[auth] Unexpected error verifying credentials:", error);
    }
    return null;
  }

  const user = await getUserByFirebaseUid(firebaseUid);
  if (!user) return null;

  const [steward, administeredStewards] = await Promise.all([
    getStewardByUserId(user.userId),
    listStewardsAdministeredByUser(user.userId),
  ]);

  return {
    firebaseUid,
    userId: user.userId,
    isSystemAdmin: user.isSystemAdmin,
    stewardId: steward?.stewardId ?? null,
    administeredStewardIds: administeredStewards.map((s) => s.stewardId),
    emailVerified,
    level: user.level,
  };
}

// Suspension (level -1) is enforced here rather than in resolveAuth itself:
// a suspended user should still be able to log in and see their own account
// (e.g. to understand why they're locked out), just not perform the write
// actions gated by canManageSpot/canManageSite below.
export function isSuspended(authContext: AuthContext): boolean {
  return authContext.level === -1;
}

// Lets the spot's assigned steward (individual, or a group steward the
// caller admins), its original creator (even after stewardId has been
// reassigned or cleared -- see spots.createdByUserId), or a system admin
// manage it. The creator check is userId-based rather than stewardId-based:
// not every caller registers as a steward, and two different non-steward
// users would otherwise both compare as `null === null`. Mirrors
// SpotDetailView's client-side canManageParcel gating -- move/delete routes
// need to match it exactly, or the confirm UI shows for someone the server
// then rejects.
export function canManageSpot(
  authContext: AuthContext,
  spot: { stewardId: string | null; createdByUserId: string | null },
): boolean {
  if (isSuspended(authContext)) return authContext.isSystemAdmin;
  return (
    authContext.isSystemAdmin ||
    authContext.stewardId === spot.stewardId ||
    (spot.stewardId !== null &&
      authContext.administeredStewardIds.includes(spot.stewardId)) ||
    authContext.userId === spot.createdByUserId
  );
}

// Only the observation's own submitter may edit it, and only within
// OBSERVATION_EDIT_WINDOW_MS of logging it -- unlike canManageSpot/
// canManageSite, there's no admin override: nobody else's account should be
// able to silently alter what a user recorded seeing.
export function canEditObservation(
  authContext: AuthContext,
  observation: { observerId: string | null; createdAt: string },
): boolean {
  if (isSuspended(authContext)) return false;
  if (!observation.observerId || authContext.userId !== observation.observerId) {
    return false;
  }
  const ageMs = Date.now() - new Date(observation.createdAt).getTime();
  return ageMs >= 0 && ageMs < OBSERVATION_EDIT_WINDOW_MS;
}

// Sites have no steward-level ownership (unlike spots) -- gated directly on
// the creating user via sites.createdBy instead of a stewardId match.
export function canManageSite(
  authContext: AuthContext,
  site: { createdBy: string | null },
): boolean {
  if (isSuspended(authContext)) return authContext.isSystemAdmin;
  return authContext.isSystemAdmin || authContext.userId === site.createdBy;
}

// Generates the oobCode link via Firebase Admin (only Firebase can mint one)
// and sends it ourselves via email.ts, rather than relying on Firebase's own
// hosted mailer -- see GO_LIVE_CHECKLIST.md's Resend section.
export async function sendVerificationEmailForUser(
  email: string,
  continueUrl: string,
): Promise<void> {
  const link = await logRemoteCall("firebase-admin", "generateEmailVerificationLink", () =>
    adminAuth().generateEmailVerificationLink(email, { url: continueUrl }),
  );
  await sendVerificationEmail(email, link);
}

// Silently no-ops for an unregistered email (mirrors Firebase's own
// enumeration-safe behavior, which reset-password/page.tsx previously
// depended on) so callers can always show the same "if an account exists…"
// message regardless of whether the address is real.
export async function requestPasswordResetEmail(
  email: string,
  continueUrl: string,
): Promise<void> {
  let link: string;
  try {
    link = await logRemoteCall("firebase-admin", "generatePasswordResetLink", () =>
      adminAuth().generatePasswordResetLink(email, { url: continueUrl }),
    );
  } catch (error) {
    if (error instanceof FirebaseAuthError && error.code === "auth/user-not-found") {
      return;
    }
    throw error;
  }
  await sendPasswordResetEmail(email, link);
}
