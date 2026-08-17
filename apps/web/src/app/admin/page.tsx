import {
  getAppSettings,
  getUserByUserId,
  listRecentObservations,
  listRecentSites,
  listRecentSpots,
  listRecentUsers,
} from "@placekeeping/core";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LogDisplay, type LogEntry } from "@/components/LogDisplay";
import { WritesPauseToggle } from "@/components/forms/WritesPauseToggle";
import { requireAuthContext } from "@/lib/session";

const RECENT_LIMIT = 15;

export default async function AdminPage() {
  const authContext = await requireAuthContext();
  if (!authContext.isSystemAdmin) notFound();

  const [settings, recentUsers, recentSites, recentSpots, recentObservations] =
    await Promise.all([
      getAppSettings(),
      listRecentUsers(RECENT_LIMIT),
      listRecentSites(RECENT_LIMIT),
      listRecentSpots(RECENT_LIMIT),
      listRecentObservations(RECENT_LIMIT),
    ]);
  const pausedBy = settings.pausedByUserId
    ? await getUserByUserId(settings.pausedByUserId)
    : null;

  const entries: LogEntry[] = [
    ...recentUsers.map(
      (u): LogEntry => ({
        id: `user-${u.userId}`,
        kind: "user",
        title: u.username,
        timestamp: u.createdAt.toISOString(),
        href: `/user/${u.username}`,
      }),
    ),
    ...recentSites.map(
      (s): LogEntry => ({
        id: `site-${s.siteId}`,
        kind: "site",
        title: s.name,
        detail: s.createdByUsername ? `by ${s.createdByUsername}` : undefined,
        timestamp: s.createdAt,
        href: `/sites/${s.siteId}`,
      }),
    ),
    ...recentSpots.map(
      (s): LogEntry => ({
        id: `spot-${s.spotId}`,
        kind: "spot",
        title: s.name,
        detail: s.createdByUsername ? `by ${s.createdByUsername}` : undefined,
        timestamp: s.dateAdded,
        href: `/spots/${s.spotId}`,
      }),
    ),
    ...recentObservations.map(
      (o): LogEntry => ({
        id: `observation-${o.observationId}`,
        kind: "observation",
        title: o.spotName,
        detail: o.observerUsername ? `by ${o.observerUsername}` : undefined,
        timestamp: o.createdAt,
        href: `/spots/${o.spotId}`,
      }),
    ),
  ].sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-8">
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">Admin</h1>
        <section className="flex flex-col gap-2 rounded-md border border-neutral-200 p-4">
          <h2 className="font-medium">Pause writes for an upgrade</h2>
          <p className="text-sm text-neutral-600">
            Flip this on right before running a database migration or
            upgrade, so no requests can write against a schema that&apos;s
            about to change. Flip it back off once the upgrade is done.
          </p>
          {settings.writesPaused && settings.pausedAt && (
            <p className="text-sm text-neutral-600">
              Paused since {new Date(settings.pausedAt).toLocaleString()}
              {pausedBy ? ` by ${pausedBy.username}` : ""}.
            </p>
          )}
          <WritesPauseToggle initialPaused={settings.writesPaused} />
        </section>
      </div>
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Recent activity</h2>
          <Link href="/admin/events" className="text-sm underline">
            View full event log &rarr;
          </Link>
        </div>
        <LogDisplay entries={entries.slice(0, RECENT_LIMIT)} />
      </section>
    </main>
  );
}
