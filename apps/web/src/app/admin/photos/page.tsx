import { listAdminPhotos } from "@placekeeping/core";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminPhotoManager } from "@/components/admin/AdminPhotoManager";
import { requireAuthContext } from "@/lib/session";

export default async function AdminPhotosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const authContext = await requireAuthContext();
  if (!authContext.isSystemAdmin) notFound();

  const [photos, params] = await Promise.all([listAdminPhotos(), searchParams]);
  // Seed the client's filter/sort/group state from the URL so a shared link
  // opens the same view.
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") query.set(key, value);
  }

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Photos</h1>
        <Link href="/admin" className="text-sm underline">
          Back to admin
        </Link>
      </div>
      <AdminPhotoManager initialRows={photos} initialQuery={query.toString()} />
    </main>
  );
}
