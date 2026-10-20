import { identifyPhoto } from "@placekeeping/core";
import { identifyRequestSchema } from "@placekeeping/shared-types";
import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/apiError";
import { getAuthContext } from "@/lib/session";

type Params = { params: Promise<{ observationId: string }> };

// Sends a photo (or a rectangle of it) to Pl@ntNet and stores the top
// candidates as 'suggested'. See local/species-id.md.
export const POST = withApiErrorHandling(
  async (request: NextRequest, { params }: Params) => {
    const { observationId } = await params;
    const authContext = await getAuthContext();
    if (!authContext) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await request.json().catch(() => null);
    const parsed = identifyRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const result = await identifyPhoto(authContext, observationId, parsed.data);
    return NextResponse.json(result);
  },
);
