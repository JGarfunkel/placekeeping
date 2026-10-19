import { deleteUser, setUserLevel } from "@placekeeping/core";
import { knownLevelValues } from "@placekeeping/shared-types";
import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/apiError";
import { getAuthContext } from "@/lib/session";

type Params = { params: Promise<{ userId: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const PATCH = withApiErrorHandling(
  async (request: NextRequest, { params }: Params) => {
    const authContext = await getAuthContext();
    if (!authContext?.isSystemAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { userId } = await params;
    if (!UUID_RE.test(userId)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    const level = body?.level;
    if (
      !Number.isInteger(level) ||
      !(knownLevelValues as readonly number[]).includes(level)
    ) {
      return NextResponse.json(
        { error: "level must be one of the known levels" },
        { status: 400 },
      );
    }

    const result = await setUserLevel(userId, level, authContext.userId);
    if (!result) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ user: result });
  },
);

export const DELETE = withApiErrorHandling(
  async (_request: NextRequest, { params }: Params) => {
    const authContext = await getAuthContext();
    if (!authContext?.isSystemAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { userId } = await params;
    if (!UUID_RE.test(userId)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const result = await deleteUser(userId, authContext.userId);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status },
      );
    }
    return NextResponse.json({ ok: true });
  },
);
