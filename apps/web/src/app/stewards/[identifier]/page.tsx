import {
  getStewardByIdForPublic,
  getStewardBySlugForPublic,
  isStewardGroupAdmin,
  listSpotsBySteward,
  listStewardMembersForPublic,
} from "@placekeeping/core";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/session";

const stewardTypeLabels: Record<string, string> = {
  individual: "Individual",
  school: "School",
  club: "Club",
  nonprofit: "Nonprofit",
  municipality: "Municipality",
};

// UUIDs route to the stewardId lookup; anything else is treated as a slug,
// so /stewards/<uuid> and /stewards/<slug> can share one route -- same
// convention as /user/[identifier].
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function StewardProfilePage({
  params,
}: {
  params: Promise<{ identifier: string }>;
}) {
  const { identifier } = await params;
  const steward = uuidPattern.test(identifier)
    ? await getStewardByIdForPublic(identifier)
    : await getStewardBySlugForPublic(identifier);
  if (!steward) notFound();

  const authContext = await getAuthContext();
  const [canManage, spots, members] = await Promise.all([
    authContext
      ? authContext.isSystemAdmin ||
        steward.userId === authContext.userId ||
        isStewardGroupAdmin(authContext.userId, steward.stewardId)
      : false,
    listSpotsBySteward(steward.stewardId),
    listStewardMembersForPublic(steward.stewardId),
  ]);

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 px-6 py-8">
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-4">
          {steward.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={steward.logoUrl}
              alt=""
              className="h-16 w-16 shrink-0 rounded-md border border-neutral-200 object-cover"
            />
          )}
          <div>
            <h1 className="text-2xl font-semibold">{steward.name}</h1>
            <p className="text-sm text-neutral-500">
              {stewardTypeLabels[steward.type] ?? steward.type}
            </p>
          </div>
        </div>
        {steward.url && (
          <a
            href={steward.url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            {steward.url}
          </a>
        )}
        {canManage && (
          <Link
            href={`/stewards/${steward.slug}/manage`}
            className="underline"
          >
            {steward.type === "individual" ? "Edit this steward record" : "Manage this group"}
          </Link>
        )}
      </div>

      {spots.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">Spots</h2>
          <ul className="flex flex-col gap-1">
            {spots.map((spot) => (
              <li key={spot.spotId}>
                <Link href={`/spots/${spot.spotId}`} className="underline">
                  {spot.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {members.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">Members</h2>
          <ul className="flex flex-col gap-1">
            {members.map((member) => (
              <li key={member.userId}>
                @{member.username}
                {member.role === "admin" && (
                  <span className="ml-1 text-xs text-neutral-500">
                    (admin)
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
