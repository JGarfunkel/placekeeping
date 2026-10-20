import { rejectCandidate } from "@placekeeping/core";
import { plantDecisionRequestSchema } from "@placekeeping/shared-types";
import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/apiError";
import { getAuthContext } from "@/lib/session";

type Params = { params: Promise<{ identificationId: string }> };

export const POST = withApiErrorHandling(
  async (request: NextRequest, { params }: Params) => {
    const { identificationId } = await params;
    const authContext = await getAuthContext();
    if (!authContext) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await request.json().catch(() => null);
    const parsed = plantDecisionRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const identification = await rejectCandidate(
      authContext,
      identificationId,
      parsed.data.observationPlantId,
    );
    return NextResponse.json({ identification });
  },
);
