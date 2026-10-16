import {
  listTerritoryEvents,
  listTerritoryTasks,
  type AuthContext,
  type TerritoryArea,
  type TerritoryPlaceRef,
} from "@placekeeping/core";
import Link from "next/link";
import { formatEventWhen } from "@/lib/careEventFormat";
import { spotPath } from "@/lib/spotPath";

function placeHref(place: TerritoryPlaceRef): string {
  return place.kind === "spot"
    ? spotPath({
        spotId: place.spotId as number,
        slugState: place.slugState,
        slugLocality: place.slugLocality,
        slug: place.slug,
      })
    : `/sites/${place.siteId}`;
}

// Upcoming events and open tasks at the spots and sites in a territory, shown
// on its page. Events follow each event's own visibility; tasks are never
// public, so they render only for verified members. Renders nothing when
// there is nothing to show.
export async function TerritoryActivity({
  area,
  authContext,
}: {
  area: TerritoryArea;
  authContext: AuthContext | null;
}) {
  const [events, tasks] = await Promise.all([
    listTerritoryEvents(authContext, area),
    listTerritoryTasks(authContext, area),
  ]);
  if (events.length === 0 && tasks.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      {events.length > 0 && (
        <section className="flex flex-col gap-2 rounded-md border border-neutral-200 p-4 text-sm">
          <h2 className="text-base font-medium">Upcoming events</h2>
          <ul className="flex flex-col gap-3">
            {events.map((e) => (
              <li key={e.id}>
                <Link href={`/events/${e.id}`} className="font-medium underline">
                  {e.title}
                </Link>
                <div className="text-neutral-600">{formatEventWhen(e)}</div>
                <div className="text-xs text-neutral-500">
                  At{" "}
                  <Link href={placeHref(e.place)} className="underline">
                    {e.place.name}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tasks.length > 0 && (
        <section className="flex flex-col gap-2 rounded-md border border-neutral-200 p-4 text-sm">
          <h2 className="text-base font-medium">Open tasks</h2>
          <p className="text-xs text-neutral-500">Only members and stewards can see these.</p>
          <ul className="flex flex-col gap-3">
            {tasks.map((t) => (
              <li key={t.id}>
                <div className="font-medium">{t.title}</div>
                <div className="text-xs text-neutral-500">
                  At{" "}
                  <Link href={placeHref(t.place)} className="underline">
                    {t.place.name}
                  </Link>
                  {t.dueOn ? ` · due ${t.dueOn}` : ""}
                  {t.assigneeName ? ` · @${t.assigneeName}` : ""}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
