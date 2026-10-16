"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Scope = { stewardId: string } | { siteId: number } | { spotId: number };

export type RecurringItem = {
  id: string;
  title: string;
  unit: string;
  interval: number;
  nextDueOn: string;
  leadDays: number;
  status: string;
  pausedReason: string | null;
};

function cadence(unit: string, interval: number) {
  return interval === 1 ? `every ${unit}` : `every ${interval} ${unit}s`;
}

export function AsanaRecurringTasks({
  scope,
  items,
  title = "Recurring tasks",
  fansOut = false,
}: {
  scope: Scope;
  items: RecurringItem[];
  title?: string;
  // True for steward/site scopes: one task is created per spot.
  fansOut?: boolean;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [unit, setUnit] = useState("year");
  const [interval, setInterval] = useState(1);
  const [firstDueOn, setFirstDueOn] = useState("");
  const [leadDays, setLeadDays] = useState(30);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(url: string, init: RequestInit) {
    setError(null);
    setPending(true);
    try {
      const res = await fetch(url, {
        ...init,
        headers: { "Content-Type": "application/json" },
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          typeof body?.error === "string" ? body.error : "Request failed",
        );
      }
      router.refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      return false;
    } finally {
      setPending(false);
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const ok = await call("/api/integrations/asana/recurring", {
      method: "POST",
      body: JSON.stringify({
        scope,
        title: taskTitle,
        notes,
        unit,
        interval,
        firstDueOn,
        leadDays,
      }),
    });
    if (ok) {
      setAdding(false);
      setTaskTitle("");
      setNotes("");
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-neutral-200 p-4 text-sm">
      <h2 className="text-base font-medium">{title}</h2>
      {items.length === 0 && !adding && (
        <p className="text-neutral-600">No recurring tasks.</p>
      )}
      {items.length > 0 && (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id} className="flex flex-col gap-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <strong>{item.title}</strong>
                {item.status === "paused" && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
                    Paused
                  </span>
                )}
                <span className="ml-auto flex gap-3 text-xs">
                  <button
                    type="button"
                    className="underline"
                    disabled={pending}
                    onClick={() =>
                      call(`/api/integrations/asana/recurring/${item.id}`, {
                        method: "PATCH",
                        body: JSON.stringify({
                          status: item.status === "paused" ? "active" : "paused",
                        }),
                      })
                    }
                  >
                    {item.status === "paused" ? "Resume as me" : "Pause"}
                  </button>
                  <button
                    type="button"
                    className="underline"
                    disabled={pending}
                    onClick={() => {
                      if (confirm(`Delete "${item.title}"? Tasks already created in Asana stay.`)) {
                        void call(`/api/integrations/asana/recurring/${item.id}`, {
                          method: "DELETE",
                        });
                      }
                    }}
                  >
                    Delete
                  </button>
                </span>
              </div>
              <p className="text-xs text-neutral-500">
                {cadence(item.unit, item.interval)}; next due {item.nextDueOn},
                created {item.leadDays} days ahead.
              </p>
              {item.pausedReason && (
                <p className="text-xs text-amber-800">{item.pausedReason}</p>
              )}
            </li>
          ))}
        </ul>
      )}

      {!adding ? (
        <div>
          <button type="button" className="underline" onClick={() => setAdding(true)}>
            Add recurring task
          </button>
        </div>
      ) : (
        <form onSubmit={add} className="flex flex-col gap-2">
          <label className="flex flex-col gap-1">
            Title
            <input
              required
              maxLength={500}
              className="rounded-md border border-neutral-300 px-3 py-2"
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            Description
            <textarea
              rows={3}
              className="rounded-md border border-neutral-300 px-3 py-2"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1">
              Repeat every
              <span className="flex gap-2">
                <input
                  type="number"
                  min={1}
                  max={60}
                  className="w-20 rounded-md border border-neutral-300 px-3 py-2"
                  value={interval}
                  onChange={(e) => setInterval(Number(e.target.value) || 1)}
                />
                <select
                  className="rounded-md border border-neutral-300 px-3 py-2"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                >
                  <option value="week">week(s)</option>
                  <option value="month">month(s)</option>
                  <option value="year">year(s)</option>
                </select>
              </span>
            </label>
            <label className="flex flex-col gap-1">
              First due date
              <input
                required
                type="date"
                className="rounded-md border border-neutral-300 px-3 py-2"
                value={firstDueOn}
                onChange={(e) => setFirstDueOn(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1">
              Create this many days ahead
              <input
                type="number"
                min={0}
                max={365}
                className="w-24 rounded-md border border-neutral-300 px-3 py-2"
                value={leadDays}
                onChange={(e) => setLeadDays(Number(e.target.value) || 0)}
              />
            </label>
          </div>
          <p className="text-xs text-neutral-500">
            Tasks are created in Asana as you, so keep your Asana connection
            active. {fansOut && "One task is created for each spot in scope."}
          </p>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-neutral-900 px-4 py-2 font-medium text-white disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save recurring task"}
            </button>
            <button type="button" className="underline" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {error && <p className="text-red-600">{error}</p>}
    </div>
  );
}
