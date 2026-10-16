import {
  disconnectAsana,
  listAsanaIdentitiesForUser,
} from "@placekeeping/core";
import { NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/apiError";
import { requireApiAuth } from "@/lib/integrationAuth";

export const GET = withApiErrorHandling(async () => {
  const auth = await requireApiAuth();
  if ("response" in auth) return auth.response;
  const identities = await listAsanaIdentitiesForUser(auth.ctx.userId);
  return NextResponse.json({ identities });
});

// Disconnects every Asana workspace linked to the caller.
export const DELETE = withApiErrorHandling(async () => {
  const auth = await requireApiAuth();
  if ("response" in auth) return auth.response;
  await disconnectAsana(auth.ctx.userId);
  return NextResponse.json({ ok: true });
});
