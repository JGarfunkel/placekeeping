import {
  countEvents,
  EVENT_ENTITY_TYPES,
  listEvents,
  type EventAction,
  type EventChanges,
} from "@placekeeping/core";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuthContext } from "@/lib/session";

const PAGE_SIZE = 50;
const ACTIONS: EventAction[] = ["create", "update", "delete"];

const ACTION_LABELS: Record<EventAction, string> = {
  create: "Created",
  update: "Updated",
  delete: "Deleted",
};

// Only entity types whose id is directly a route segment get a link --
// observation ids don't resolve to a URL without also knowing spotId, which
// isn't reliably present in every event's `changes`.
function entityHref(entityType: string, entityId: string): string | null {
  switch (entityType) {
    case "spot":
      return `/spots/${entityId}`;
    case "site":
      return `/sites/${entityId}`;
    case "steward":
      return `/stewards/${entityId}`;
    default:
      return null;
  }
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value.length > 80 ? `${value.slice(0, 80)}…` : value;
  return JSON.stringify(value);
}

function ChangesDetail({ changes }: { changes: EventChanges | null }) {
  if (!changes || Object.keys(changes).length === 0) {
    return <span className="text-xs text-neutral-400">no field changes</span>;
  }
  const fields = Object.entries(changes);
  return (
    <details>
      <summary className="cursor-pointer text-xs text-neutral-500">
        {fields.length} field{fields.length === 1 ? "" : "s"}
      </summary>
      <ul className="mt-1 flex flex-col gap-0.5 text-xs text-neutral-600">
        {fields.map(([field, { from, to }]) => (
          <li key={field}>
            <span className="font-mono">{field}</span>: {formatValue(from)} &rarr;{" "}
            {formatValue(to)}
          </li>
        ))}
      </ul>
    </details>
  );
}

function buildHref(
  base: string,
  params: { entityType?: string; action?: string; page?: number },
): string {
  const query = new URLSearchParams();
  if (params.entityType) query.set("entityType", params.entityType);
  if (params.action) query.set("action", params.action);
  if (params.page && params.page > 1) query.set("page", String(params.page));
  const qs = query.toString();
  return qs ? `${base}?${qs}` : base;
}

type SearchParams = { entityType?: string; action?: string; page?: string };

export default async function AdminEventsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const authContext = await requireAuthContext();
  if (!authContext.isSystemAdmin) notFound();

  const params = await searchParams;
  const entityType = params.entityType || undefined;
  const action = ACTIONS.includes(params.action as EventAction)
    ? (params.action as EventAction)
    : undefined;
  const page = Math.max(1, Number(params.page) || 1);

  const filter = { entityType, action };
  const [events, total] = await Promise.all([
    listEvents(filter, PAGE_SIZE, (page - 1) * PAGE_SIZE),
    countEvents(filter),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Event log</h1>
        <Link href="/admin" className="text-sm underline">
          Back to admin
        </Link>
      </div>

      <form className="flex flex-wrap items-end gap-3" method="get">
        <label className="flex flex-col gap-1 text-sm">
          Entity type
          <select
            name="entityType"
            defaultValue={entityType ?? ""}
            className="rounded border border-neutral-300 px-2 py-1"
          >
            <option value="">All</option>
            {EVENT_ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Action
          <select
            name="action"
            defaultValue={action ?? ""}
            className="rounded border border-neutral-300 px-2 py-1"
          >
            <option value="">All</option>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {ACTION_LABELS[a]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white"
        >
          Filter
        </button>
      </form>

      <p className="text-sm text-neutral-500">
        {total} event{total === 1 ? "" : "s"}
      </p>

      {events.length === 0 ? (
        <p className="text-sm text-neutral-500">No matching events.</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
              <th className="py-2 pr-2 font-medium">When</th>
              <th className="py-2 pr-2 font-medium">Who</th>
              <th className="py-2 pr-2 font-medium">Action</th>
              <th className="py-2 pr-2 font-medium">Entity</th>
              <th className="py-2 font-medium">Changes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {events.map((event) => {
              const href = entityHref(event.entityType, event.entityId);
              return (
                <tr key={event.eventId} className="align-top">
                  <td className="whitespace-nowrap py-2 pr-2 text-xs text-neutral-500">
                    {new Date(event.createdAt).toLocaleString()}
                  </td>
                  <td className="py-2 pr-2">{event.username ?? "system"}</td>
                  <td className="py-2 pr-2">{ACTION_LABELS[event.action]}</td>
                  <td className="py-2 pr-2">
                    <span className="text-xs uppercase tracking-wide text-neutral-500">
                      {event.entityType}
                    </span>{" "}
                    {href ? (
                      <Link href={href} className="underline">
                        {event.entityId}
                      </Link>
                    ) : (
                      <span className="font-mono text-xs">{event.entityId}</span>
                    )}
                  </td>
                  <td className="py-2">
                    <ChangesDetail changes={event.changes} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <div className="flex items-center justify-between text-sm">
        {page > 1 ? (
          <Link
            href={buildHref("/admin/events", { entityType, action, page: page - 1 })}
            className="underline"
          >
            Previous
          </Link>
        ) : (
          <span />
        )}
        <span className="text-neutral-500">
          Page {page} of {totalPages}
        </span>
        {page < totalPages ? (
          <Link
            href={buildHref("/admin/events", { entityType, action, page: page + 1 })}
            className="underline"
          >
            Next
          </Link>
        ) : (
          <span />
        )}
      </div>
    </main>
  );
}
