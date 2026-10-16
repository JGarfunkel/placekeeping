import { getCareEventView, getSiteById, getSpotById } from "@placekeeping/core";
import { formatTimeslot } from "@placekeeping/shared-types";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { CancelEventButton } from "@/components/events/CancelEventButton";
import { EventSignupPanel } from "@/components/events/EventSignupPanel";
import { formatEventWhen } from "@/lib/careEventFormat";
import { getAuthContext } from "@/lib/session";
import { spotPath } from "@/lib/spotPath";

// Shared by generateMetadata and the page so the event is fetched once.
const loadView = cache(async (eventId: string) =>
  getCareEventView(eventId, await getAuthContext()),
);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ eventId: string }>;
}): Promise<Metadata> {
  const { eventId } = await params;
  const view = await loadView(eventId);
  return view ? { title: view.event.title } : {};
}

const confirmNotices: Record<string, string> = {
  ok: "You're confirmed. See you there!",
  invalid: "That confirmation link is invalid or has expired. Please sign up again.",
};

export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ confirm?: string }>;
}) {
  const [{ eventId }, { confirm }] = await Promise.all([params, searchParams]);
  const [view, authContext] = await Promise.all([loadView(eventId), getAuthContext()]);
  // 404 (not 403) when the viewer can't see the event, so private events
  // don't reveal that they exist.
  if (!view) notFound();
  const { event } = view;

  // The page leads with the place and what is being done there.
  const place =
    event.spotId != null
      ? await getSpotById(event.spotId).then((s) =>
          s ? { name: s.name, href: spotPath(s), kind: "spot" } : null,
        )
      : event.siteId != null
        ? await getSiteById(event.siteId).then((s) =>
            s ? { name: s.name, href: `/sites/${s.siteId}`, kind: "site" } : null,
          )
        : null;

  const canceled = event.status === "canceled";
  const ended = event.endAt.getTime() <= Date.now();
  const deadlinePassed =
    !!event.signupDeadline && event.signupDeadline.getTime() <= Date.now();
  const open = event.status === "planned" && event.signupOpen && !ended && !deadlinePassed;
  const closedReason = canceled
    ? "This event was canceled."
    : ended
      ? "This event has ended."
      : deadlinePassed
        ? "The sign-up deadline has passed."
        : event.status === "held"
          ? "This event has taken place."
          : "Sign-up is closed.";

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-5 px-6 py-8">
      {confirm && confirmNotices[confirm] && (
        <p className="rounded-md bg-neutral-100 px-3 py-2 text-sm">{confirmNotices[confirm]}</p>
      )}

      <div>
        {place && (
          <p className="text-sm text-neutral-500">
            At{" "}
            <Link href={place.href} className="underline">
              {place.name}
            </Link>
          </p>
        )}
        <h1 className="text-2xl font-semibold">{event.title}</h1>
        <p className="text-sm text-neutral-700">{formatEventWhen(event)}</p>
        {canceled && (
          <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
            Canceled{event.cancelReason ? `: ${event.cancelReason}` : "."}
          </p>
        )}
      </div>

      {event.description && (
        <p className="whitespace-pre-line text-sm">{event.description}</p>
      )}

      <dl className="flex flex-col gap-2 text-sm">
        <div>
          <dt className="font-medium">Where to meet</dt>
          <dd className="text-neutral-700">
            {event.locationText === null
              ? "Shown to confirmed participants."
              : event.locationText || "See the place page."}
          </dd>
        </div>
        {event.url && (
          <div>
            <dt className="font-medium">More information</dt>
            <dd>
              {/* An outside link a manager entered: open it safely. */}
              <a href={event.url} target="_blank" rel="noopener noreferrer nofollow"
                className="break-all text-neutral-700 underline">
                {event.url}
              </a>
            </dd>
          </div>
        )}
        {event.whatToBring && (
          <div>
            <dt className="font-medium">What to bring</dt>
            <dd className="text-neutral-700">{event.whatToBring}</dd>
          </div>
        )}
        {event.notesForVolunteers && (
          <div>
            <dt className="font-medium">Notes for volunteers</dt>
            <dd className="whitespace-pre-line text-neutral-700">{event.notesForVolunteers}</dd>
          </div>
        )}
      </dl>

      <section className="flex flex-col gap-3 rounded-md border border-neutral-200 p-4">
        <h2 className="text-base font-medium">
          {view.headcount} {view.headcount === 1 ? "person" : "people"} signed up
        </h2>
        {!canceled && (
          <EventSignupPanel
            eventId={event.id}
            signedIn={!!authContext}
            going={view.myParticipation?.status === "going" && view.myParticipation.confirmed}
            timeslot={view.myParticipation?.timeslot ?? null}
            open={open}
            closedReason={closedReason}
            guestAllowed={event.visibility === "public"}
          />
        )}
        {view.myParticipation?.status === "going" && !view.myParticipation.confirmed && (
          <p className="text-sm text-neutral-600">Check your email to confirm your sign-up.</p>
        )}
        {view.roster && view.roster.length > 0 && (
          <ul className="flex flex-wrap gap-2 text-sm">
            {view.roster.map((p) => (
              <li key={p.userId} className="rounded-full bg-neutral-100 px-2 py-0.5">
                <Link href={`/user/${p.userId}`}>@{p.username}</Link>
                {p.role === "lead" && " (lead)"}
                {p.timeslot && (
                  <span className="text-xs text-neutral-500"> · {formatTimeslot(p.timeslot)}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {view.canManage && event.status === "planned" && (
        <section className="flex flex-col gap-3 text-sm">
          <div>
            <Link href={`/events/${event.id}/edit`} className="underline">
              Edit event
            </Link>
          </div>
          <CancelEventButton eventId={event.id} />
        </section>
      )}
    </main>
  );
}
