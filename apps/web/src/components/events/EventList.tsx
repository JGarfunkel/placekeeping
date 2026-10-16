import {
  canManageCareEvent,
  listCareEventsForTarget,
  type AuthContext,
} from "@placekeeping/core";
import Link from "next/link";
import { formatEventWhen } from "@/lib/careEventFormat";

type Target = { siteId: number } | { spotId: number };

// Upcoming events for a site or spot, plus a "schedule" link for managers.
// Visibility filtering happens in listCareEventsForTarget, so a private event
// never reaches this markup for someone who shouldn't see it.
export async function EventList({
  target,
  authContext,
}: {
  target: Target;
  authContext: AuthContext | null;
}) {
  const [events, canSchedule] = await Promise.all([
    listCareEventsForTarget(target, authContext, { upcomingOnly: true }),
    canManageCareEvent(authContext, {
      siteId: "siteId" in target ? target.siteId : null,
      spotId: "spotId" in target ? target.spotId : null,
    }),
  ]);
  const upcoming = events.filter((e) => e.status !== "canceled");
  if (upcoming.length === 0 && !canSchedule) return null;

  const query =
    "siteId" in target ? `siteId=${target.siteId}` : `spotId=${target.spotId}`;

  return (
    <section className="flex flex-col gap-2 rounded-md border border-neutral-200 p-4 text-sm">
      <h2 className="text-base font-medium">Upcoming events</h2>
      {upcoming.length === 0 ? (
        <p className="text-neutral-600">Nothing scheduled.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {upcoming.map((e) => (
            <li key={e.id}>
              <Link href={`/events/${e.id}`} className="font-medium underline">
                {e.title}
              </Link>
              <div className="text-neutral-600">{formatEventWhen(e)}</div>
            </li>
          ))}
        </ul>
      )}
      {canSchedule && (
        <Link href={`/events/new?${query}`} className="font-medium underline">
          Schedule an event
        </Link>
      )}
    </section>
  );
}
