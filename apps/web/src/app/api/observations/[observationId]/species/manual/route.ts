import { createManualIdentification } from "@placekeeping/core";
import { manualSpeciesRequestSchema } from "@placekeeping/shared-types";
import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/apiError";
import { getAuthContext } from "@/lib/session";

type Params = { params: Promise<{ observationId: string }> };

// A keeper-typed species name: no Pl@ntNet call, one verified 'keeper' row.
export const POST = withApiErrorHandling(
  async (request: NextRequest, { params }: Params) => {
    const { observationId } = await params;
    const authContext = await getAuthContext();
    if (!authContext) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await request.json().catch(() => null);
    const parsed = manualSpeciesRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const identification = await createManualIdentification(
      authContext,
      observationId,
      parsed.data,
    );
    return NextResponse.json({ identification });
  },
);
