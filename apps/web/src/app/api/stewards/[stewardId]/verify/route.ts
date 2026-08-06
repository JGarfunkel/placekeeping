import { verifyStewardContact } from "@placekeeping/core";
import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/apiError";
import { getAppBaseUrl } from "@/lib/appBaseUrl";

// No auth required -- the token itself is the credential, same as a
// password-reset link. Redirects rather than returning JSON since a human
// is clicking this from an email client.
export const GET = withApiErrorHandling(
  async (
    request: NextRequest,
    { params }: { params: Promise<{ stewardId: string }> },
  ) => {
    const { stewardId } = await params;
    const token = request.nextUrl.searchParams.get("token");

    const result = token
      ? await verifyStewardContact(stewardId, token)
      : { ok: false as const, reason: "invalid" as const };

    if (result.ok) {
      return NextResponse.redirect(
        `${getAppBaseUrl()}/stewards/${stewardId}/manage?verified=1`,
      );
    }
    return NextResponse.redirect(
      `${getAppBaseUrl()}/stewards/verify-failed?reason=${result.reason}`,
    );
  },
);
