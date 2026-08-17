import { SpotForm } from "@/components/forms/SpotForm";
import { requireAuthContext } from "@/lib/session";

export default async function NewSpotPage({
  searchParams,
}: {
  searchParams: Promise<{ coverPhotoUrl?: string; coverPhotoObservedAt?: string }>;
}) {
  await requireAuthContext();
  const params = await searchParams;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-8">
      <h1 className="text-2xl font-semibold">Add a spot</h1>
      <SpotForm
        initialCoverPhotoUrl={params.coverPhotoUrl || undefined}
        initialCoverPhotoObservedAt={params.coverPhotoObservedAt || undefined}
      />
    </main>
  );
}
