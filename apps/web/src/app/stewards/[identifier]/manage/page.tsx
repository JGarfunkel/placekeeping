import {
  getStewardByStewardId,
  getStewardBySlug,
  isStewardGroupAdmin,
  listStewardMembers,
} from "@placekeeping/core";
import { notFound } from "next/navigation";
import { StewardMembersManager } from "@/components/forms/StewardMembersManager";
import { StewardProfileForm } from "@/components/forms/StewardProfileForm";
import { requireAuthContext } from "@/lib/session";

// Same uuid-vs-slug dispatch as the parent /stewards/[identifier] route.
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function ManageStewardPage({
  params,
}: {
  params: Promise<{ identifier: string }>;
}) {
  const { identifier } = await params;
  const authContext = await requireAuthContext();
  const steward = uuidPattern.test(identifier)
    ? await getStewardByStewardId(identifier)
    : await getStewardBySlug(identifier);
  if (!steward) notFound();

  const authorized =
    authContext.isSystemAdmin ||
    steward.userId === authContext.userId ||
    (await isStewardGroupAdmin(authContext.userId, steward.stewardId));
  if (!authorized) notFound();

  // Individual stewards (the "become a steward" record a single user owns)
  // have no roster -- steward_members only applies to groups, so this
  // section would just be a broken "add member" form for them.
  const members =
    steward.type === "individual"
      ? []
      : await listStewardMembers(steward.stewardId);

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 px-6 py-8">
      <h1 className="text-2xl font-semibold">Manage {steward.name}</h1>

      <StewardProfileForm
        steward={{
          stewardId: steward.stewardId,
          slug: steward.slug,
          name: steward.name,
          type: steward.type,
          url: steward.url,
          contact: steward.contact,
          logoUrl: steward.logoUrl,
          publicDisplay: steward.publicDisplay,
          level: steward.level,
          createdAt: steward.createdAt.toISOString(),
        }}
        editEndpoint={`/api/stewards/${steward.stewardId}`}
      />

      {steward.type !== "individual" && (
        <div>
          <h2 className="mb-2 text-lg font-medium">Members</h2>
          <StewardMembersManager stewardId={steward.stewardId} members={members} />
        </div>
      )}
    </main>
  );
}
