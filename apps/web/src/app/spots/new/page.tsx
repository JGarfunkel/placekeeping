import {
  photoUploadMetaSchema,
  type PhotoUploadMeta,
} from "@placekeeping/shared-types";
import { SpotForm } from "@/components/forms/SpotForm";
import { requireAuthContext } from "@/lib/session";

export default async function NewSpotPage({
  searchParams,
}: {
  searchParams: Promise<{
    coverPhotoUrl?: string;
    coverPhotoObservedAt?: string;
    coverPhotoMeta?: string;
  }>;
}) {
  await requireAuthContext();
  const params = await searchParams;

  // The server re-validates this against storage before trusting it, so a
  // hand-edited param can at worst cost the photo its variants.
  let coverPhotoMeta: PhotoUploadMeta | undefined;
  if (params.coverPhotoMeta) {
    try {
      const parsed = photoUploadMetaSchema.safeParse(JSON.parse(params.coverPhotoMeta));
      if (parsed.success) coverPhotoMeta = parsed.data;
    } catch {
      // malformed param -- fall back to no variants
    }
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-8">
      <h1 className="text-2xl font-semibold">Add a spot</h1>
      <SpotForm
        initialCoverPhotoUrl={params.coverPhotoUrl || undefined}
        initialCoverPhotoObservedAt={params.coverPhotoObservedAt || undefined}
        initialCoverPhotoMeta={coverPhotoMeta}
      />
    </main>
  );
}
