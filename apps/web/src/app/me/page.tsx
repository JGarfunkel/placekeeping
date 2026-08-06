import {
  getStewardByStewardId,
  getUserByUserId,
  listStewardsForUser,
} from "@placekeeping/core";
import { levelLabel } from "@placekeeping/shared-types";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BecomeStewardButton } from "@/components/forms/BecomeStewardButton";
import { LogoutButton } from "@/components/forms/LogoutButton";
import { ProfilePhotoForm } from "@/components/forms/ProfilePhotoForm";
import { ResendVerificationButton } from "@/components/forms/ResendVerificationButton";
import { UsernameForm } from "@/components/forms/UsernameForm";
import { requireAuthContext } from "@/lib/session";

export default async function MyProfilePage() {
  const authContext = await requireAuthContext();
  const user = await getUserByUserId(authContext.userId);
  if (!user) notFound();

  const steward = authContext.stewardId
    ? await getStewardByStewardId(authContext.stewardId)
    : null;
  const groups = await listStewardsForUser(authContext.userId);

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold">My profile</h1>
        <p className="text-sm text-neutral-500">{user.name}</p>
        {user.email && <p className="text-sm text-neutral-500">{user.email}</p>}
        <p className="text-sm text-neutral-500">Level: {levelLabel(user.level)}</p>
      </div>

      <ProfilePhotoForm photoUrl={user.photoUrl} />

      <UsernameForm username={user.username} />

      {!authContext.emailVerified && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p>Your email address isn&apos;t verified yet.</p>
          <ResendVerificationButton />
        </div>
      )}

      {steward ? (
        <div className="flex items-center justify-between gap-3 rounded-md border border-neutral-200 p-4">
          <p className="text-sm text-neutral-600">
            You&apos;re a steward: <strong>{steward.name}</strong>
          </p>
          <Link href={`/stewards/${steward.slug}/manage`} className="underline">
            Edit steward record
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-2 rounded-md border border-neutral-200 p-4">
          <p className="text-sm text-neutral-600">
            You&apos;re not a steward yet. Sign up to be listed as the steward
            of a spot.
          </p>
          <BecomeStewardButton />
        </div>
      )}

      {groups.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">Your groups</h2>
          <ul className="flex flex-col gap-1">
            {groups.map((group) => (
              <li key={group.stewardId}>
                <Link
                  href={
                    group.role === "admin"
                      ? `/stewards/${group.slug}/manage`
                      : `/stewards/${group.slug}`
                  }
                  className="underline"
                >
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

      {user.isSystemAdmin && (
        <Link href="/admin/groups/new" className="underline">
          Create a group steward
        </Link>
      )}

      <LogoutButton />
    </main>
  );
}
