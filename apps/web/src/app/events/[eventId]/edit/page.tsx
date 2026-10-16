import { canManageCareEvent, getCareEvent } from "@placekeeping/core";
import { notFound, redirect } from "next/navigation";
import { EventForm } from "@/components/events/EventForm";
import { requireAuthContext } from "@/lib/session";

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const authContext = await requireAuthContext();
  const { eventId } = await params;
  const event = await getCareEvent(eventId);
  if (!event || !(await canManageCareEvent(authContext, event))) notFound();
  if (event.status !== "planned") redirect(`/events/${eventId}`);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-6 py-8">
      <h1 className="text-2xl font-semibold">Edit event</h1>
      <EventForm
        event={{
          id: event.id,
          title: event.title,
          description: event.description,
          startAt: event.startAt.toISOString(),
          endAt: event.endAt.toISOString(),
          locationText: event.locationText,
          url: event.url,
          visibility: event.visibility,
          signupOpen: event.signupOpen,
          whatToBring: event.whatToBring,
          notesForVolunteers: event.notesForVolunteers,
        }}
      />
    </main>
  );
}
