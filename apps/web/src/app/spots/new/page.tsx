import { getStewardByStewardId } from "@placekeeping/core";
import { SpotForm } from "@/components/forms/SpotForm";
import { requireAuthContext } from "@/lib/session";

export default async function NewSpotPage({
  searchParams,
}: {
  searchParams: Promise<{ coverPhotoUrl?: string; coverPhotoObservedAt?: string }>;
}) {
  const authContext = await requireAuthContext();
  const [ownSteward, params] = await Promise.all([
    getStewardByStewardId(authContext.stewardId),
    searchParams,
  ]);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-8">
      <h1 className="text-2xl font-semibold">Add a spot</h1>
      <SpotForm
        currentSteward={
          ownSteward
            ? { stewardId: ownSteward.stewardId, name: ownSteward.name }
            : null
        }
        initialCoverPhotoUrl={params.coverPhotoUrl || undefined}
        initialCoverPhotoObservedAt={params.coverPhotoObservedAt || undefined}
      />
    </main>
  );
}
