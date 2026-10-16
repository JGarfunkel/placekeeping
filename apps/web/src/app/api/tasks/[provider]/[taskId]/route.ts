import { getTaskProvider } from "@placekeeping/core";
import { taskProviderKindSchema, updateTaskSchema } from "@placekeeping/shared-types";
import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/apiError";
import { requireApiAuth } from "@/lib/integrationAuth";

// Task ids are only unique within a provider (an Asana link id and a native
// task id are both uuids), so the provider is part of the path.
type Params = { params: Promise<{ provider: string; taskId: string }> };

function providerFor(raw: string) {
  const kind = taskProviderKindSchema.safeParse(raw);
  return kind.success ? getTaskProvider(kind.data) : null;
}

export const GET = withApiErrorHandling(async (_req: NextRequest, { params }: Params) => {
  const auth = await requireApiAuth();
  if ("response" in auth) return auth.response;
  const { provider: raw, taskId } = await params;
  const provider = providerFor(raw);
  if (!provider) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ task: await provider.getTask(auth.ctx, taskId) });
});

export const PATCH = withApiErrorHandling(async (request: NextRequest, { params }: Params) => {
  const auth = await requireApiAuth();
  if ("response" in auth) return auth.response;
  const { provider: raw, taskId } = await params;
  const provider = providerFor(raw);
  if (!provider) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = updateTaskSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  return NextResponse.json({ task: await provider.updateTask(auth.ctx, taskId, parsed.data) });
});

export const DELETE = withApiErrorHandling(async (_req: NextRequest, { params }: Params) => {
  const auth = await requireApiAuth();
  if ("response" in auth) return auth.response;
  const { provider: raw, taskId } = await params;
  const provider = providerFor(raw);
  if (!provider) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!provider.deleteTask) {
    return NextResponse.json(
      { error: "Tasks in this tool cannot be deleted from Placekeeping." },
      { status: 400 },
    );
  }
  await provider.deleteTask(auth.ctx, taskId);
  return NextResponse.json({ ok: true });
});
