import {
  assertWritesEnabled,
  PhotoModerationError,
  WritesPausedError,
  type PhotoModerationReason,
} from "@placekeeping/core";
import { isDatabaseConnectionError } from "@placekeeping/db";
import { NextRequest, NextResponse } from "next/server";

const PHOTO_MODERATION_MESSAGES: Record<PhotoModerationReason, string> = {
  unsafe_content:
    "One of the photos didn't pass our content check and can't be added.",
  profane_text:
    "One of the photos contains text that didn't pass our content check and can't be added.",
  moderation_unavailable:
    "We couldn't verify one of the photos right now — please try again in a moment.",
  unfetchable_url:
    "One of the photo URLs couldn't be reached. Double check the link and try again.",
};

/**
 * Wraps a route handler so a database-connectivity failure comes back as a
 * clean 503, a rejected photo comes back as a clean 422, and (unless
 * skipPauseGate is set) a non-GET/HEAD request made while an admin has
 * paused writes (see appSettings.ts) comes back as a 503 too -- instead of
 * an unhandled 500 or, in the pause case, silently going through. Other
 * errors are rethrown so Next.js's default handling still applies.
 *
 * skipPauseGate is for the two routes that must keep working during a
 * pause: the admin settings route itself (so an admin can always unpause)
 * and /api/auth/session (so login/logout aren't blocked mid-freeze).
 */
export function withApiErrorHandling<Args extends unknown[]>(
  handler: (...args: Args) => Promise<NextResponse>,
  options?: { skipPauseGate?: boolean },
) {
  return async (...args: Args): Promise<NextResponse> => {
    try {
      const request = args[0] as NextRequest | undefined;
      const method = request?.method ?? "GET";
      if (!options?.skipPauseGate && method !== "GET" && method !== "HEAD") {
        await assertWritesEnabled();
      }
      return await handler(...args);
    } catch (error) {
      if (error instanceof WritesPausedError) {
        return NextResponse.json({ error: error.message }, { status: 503 });
      }
      if (isDatabaseConnectionError(error)) {
        console.error("[api] Database unavailable:", error);
        return NextResponse.json(
          {
            error:
              "The database is temporarily unavailable. Please try again shortly.",
          },
          { status: 503 },
        );
      }
      if (error instanceof PhotoModerationError) {
        console.warn("[api] Photo failed moderation:", error.url, error.reason);
        return NextResponse.json(
          { error: PHOTO_MODERATION_MESSAGES[error.reason] },
          { status: 422 },
        );
      }
      throw error;
    }
  };
}
