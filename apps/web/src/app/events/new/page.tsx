import { canManageCareEvent, getSiteById, getSpotById } from "@placekeeping/core";
import { notFound } from "next/navigation";
import { EventForm } from "@/components/events/EventForm";
import { requireAuthContext } from "@/lib/session";

export default async function NewEventPage({
  searchParams,
}: {
  searchParams: Promise<{ siteId?: string; spotId?: string }>;
}) {
  const authContext = await requireAuthContext();
  const { siteId: siteParam, spotId: spotParam } = await searchParams;

  const siteId = siteParam ? Number(siteParam) : null;
  const spotId = spotParam ? Number(spotParam) : null;
  if ((siteId === null) === (spotId === null)) notFound();

  let placeName: string | undefined;
  if (spotId !== null) {
    if (!Number.isInteger(spotId)) notFound();
    placeName = (await getSpotById(spotId))?.name;
  } else {
    if (!Number.isInteger(siteId)) notFound();
    placeName = (await getSiteById(siteId as number))?.name;
  }
  if (!placeName) notFound();

  // Same check the API route enforces; a non-manager sees a 404 rather than
  // a form that would only fail on submit.
  if (!(await canManageCareEvent(authContext, { siteId, spotId }))) notFound();

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold">Schedule an event</h1>
        <p className="text-sm text-neutral-500">At {placeName}</p>
      </div>
      <EventForm target={spotId !== null ? { spotId } : { siteId: siteId as number }} />
    </main>
  );
}
