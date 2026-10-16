import "server-only";

import {
  canManageSite,
  canManageSpot,
  getSiteById,
  getSpotById,
  type AuthContext,
  type BindingScope,
} from "@placekeeping/core";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/session";

// Shared 401 handling for the integration routes.
export async function requireApiAuth(): Promise<
  { ctx: AuthContext } | { response: NextResponse }
> {
  const ctx = await getAuthContext();
  if (!ctx) {
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { ctx };
}

// Where a binding or recurring task attaches: a steward (all its spots), a
// site, or a single spot.
export const scopeSchema = z.union([
  z.object({ stewardId: z.string().uuid() }),
  z.object({ siteId: z.number().int().positive() }),
  z.object({ spotId: z.number().int().positive() }),
]);

export async function canManageScope(ctx: AuthContext, scope: BindingScope) {
  if ("stewardId" in scope) {
    // The steward itself (an individual) or an admin of a group steward.
    return (
      ctx.isSystemAdmin ||
      ctx.stewardId === scope.stewardId ||
      ctx.administeredStewardIds.includes(scope.stewardId)
    );
  }
  if ("siteId" in scope) {
    const site = await getSiteById(scope.siteId);
    return !!site && canManageSite(ctx, site);
  }
  const spot = await getSpotById(scope.spotId);
  return !!spot && canManageSpot(ctx, spot);
}
