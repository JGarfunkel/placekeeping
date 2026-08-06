import {
  getStewardByUserId,
  getUserByUserId,
  getUserByUsername,
  listObservationsByObserver,
  listSpotsByCreator,
  listStewardsForUser,
} from "@placekeeping/core";
import Link from "next/link";
import { notFound } from "next/navigation";

// UUIDs (v1-v5) route to getUserByUserId; anything else is treated as a
// username, so /user/<uuid> and /user/username can share one route.
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function UserProfilePage({
  params,
}: {
  params: Promise<{ identifier: string }>;
}) {
  const { identifier } = await params;
  const user = uuidPattern.test(identifier)
    ? await getUserByUserId(identifier)
    : await getUserByUsername(identifier);
  if (!user) notFound();

  // The individual steward this account owns, if any -- separate from the
  // account's real `name`, which stays private (see users.username comment
  // in schema.ts: the handle is shown in place of the name anywhere a user
  // is visible to other users).
  const steward = await getStewardByUserId(user.userId);

  const allGroups = await listStewardsForUser(user.userId);
  // Public page: only list groups that have opted into public visibility.
  const groups = allGroups.filter((g) => g.publicDisplay);

  // Observations and spots are both attributed to the account directly
  // (observations.observerId, spots.createdByUserId) -- neither needs the
  // steward lookup above, which only exists for users who've also signed up
  // as an individual steward.
  const [spots, observations] = await Promise.all([
    listSpotsByCreator(user.userId),
    listObservationsByObserver(user.userId),
  ]);

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 px-6 py-8">
      <div className="flex items-start gap-4">
        {user.photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.photoUrl}
            alt=""
            className="h-16 w-16 shrink-0 rounded-full border border-neutral-200 object-cover"
          />
        )}
        <div>
          <h1 className="text-2xl font-semibold">@{user.username}</h1>
          <p className="text-sm text-neutral-500">
            Member since {user.createdAt.toLocaleDateString()}
          </p>
        </div>
      </div>

      <div>
        {steward?.publicDisplay && (
          <Link
            href={`/stewards/${steward.slug}`}
            className="text-sm underline"
          >
            View steward profile
          </Link>
        )}
      </div>

      {groups.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">Groups</h2>
          <ul className="flex flex-col gap-1">
            {groups.map((group) => (
              <li key={group.stewardId}>
                <Link href={`/stewards/${group.slug}`} className="underline">
                  {group.name}
                </Link>
                {group.role === "admin" && (
                  <span className="ml-1 text-xs text-neutral-500">(admin)</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {spots.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">Spots added</h2>
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

      {observations.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">Observations</h2>
          <ul className="flex flex-col gap-1">
            {observations.map((observation) => (
              <li key={observation.observationId} className="text-sm">
                <Link href={`/spots/${observation.spotId}`} className="underline">
                  {observation.spotName}
                </Link>{" "}
                <span className="text-neutral-500">
                  ({new Date(observation.observedAt).toLocaleDateString()})
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
