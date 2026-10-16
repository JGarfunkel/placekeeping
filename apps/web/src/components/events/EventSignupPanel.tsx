"use client";

import { formatTimeslot } from "@placekeeping/shared-types";
import { useRouter } from "next/navigation";
import { useState } from "react";

async function call(url: string, method: string, payload?: object) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(typeof body?.error === "string" ? body.error : "Request failed");
  }
  return body;
}

// "09:00" + "11:00" -> "0900-1100" (the normalized form stored with a
// sign-up, in the event's own time zone); both blank -> null, the whole event.
function toTimeslot(from: string, until: string): string | null {
  if (!from && !until) return null;
  if (!from || !until) throw new Error("Enter both a start and an end time, or leave both blank.");
  return `${from.replace(":", "")}-${until.replace(":", "")}`;
}

function fromTimeslot(slot: string | null): { from: string; until: string } {
  if (!slot) return { from: "", until: "" };
  return {
    from: `${slot.slice(0, 2)}:${slot.slice(2, 4)}`,
    until: `${slot.slice(5, 7)}:${slot.slice(7, 9)}`,
  };
}

// Optional "which part of the event can you do?" fields. Times are in the
// event's own time zone, which is the one the event page shows.
function TimeslotFields({
  from,
  until,
  onChange,
}: {
  from: string;
  until: string;
  onChange: (from: string, until: string) => void;
}) {
  const cls = "rounded-md border border-neutral-300 px-2 py-1";
  return (
    <fieldset className="flex flex-wrap items-center gap-2">
      <legend className="mb-1 text-xs text-neutral-600">
        Can only do part of it? (optional, event time)
      </legend>
      <input type="time" step={300} aria-label="From" className={cls} value={from}
        onChange={(e) => onChange(e.target.value, until)} />
      <span>to</span>
      <input type="time" step={300} aria-label="Until" className={cls} value={until}
        onChange={(e) => onChange(from, e.target.value)} />
    </fieldset>
  );
}

export function EventSignupPanel({
  eventId,
  signedIn,
  going,
  timeslot,
  open,
  closedReason,
  guestAllowed,
}: {
  eventId: string;
  signedIn: boolean;
  // The viewer is signed up and confirmed.
  going: boolean;
  // The viewer's current slot ("HHMM-HHMM"), or null for the whole event.
  timeslot: string | null;
  open: boolean;
  closedReason: string | null;
  // Guests can only join public events.
  guestAllowed: boolean;
}) {
  const router = useRouter();
  const initial = fromTimeslot(timeslot);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [from, setFrom] = useState(initial.from);
  const [until, setUntil] = useState(initial.until);
  const [editingSlot, setEditingSlot] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function run(fn: () => Promise<void>) {
    setError(null);
    setPending(true);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setPending(false);
    }
  }

  if (signedIn && going) {
    return (
      <div className="flex flex-col gap-2 text-sm">
        <p className="font-medium text-green-700">You&apos;re signed up.</p>
        <p className="text-neutral-700">
          {timeslot ? `Your time: ${formatTimeslot(timeslot)}` : "You're coming for the whole event."}
        </p>
        {editingSlot ? (
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await call(`/api/care-events/${eventId}/signup`, "PATCH", {
                  timeslot: toTimeslot(from, until),
                });
                setEditingSlot(false);
                router.refresh();
              });
            }}
          >
            <TimeslotFields from={from} until={until}
              onChange={(f, u) => { setFrom(f); setUntil(u); }} />
            <div className="flex gap-3">
              <button type="submit" disabled={pending}
                className="rounded-md bg-neutral-900 px-3 py-1.5 font-medium text-white disabled:opacity-50">
                Save
              </button>
              <button type="button" className="underline" onClick={() => setEditingSlot(false)}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="flex gap-4">
            <button type="button" className="underline" onClick={() => setEditingSlot(true)}>
              Change my time
            </button>
            <button type="button" disabled={pending} className="underline"
              onClick={() => run(async () => {
                await call(`/api/care-events/${eventId}/signup`, "DELETE");
                router.refresh();
              })}>
              Cancel my sign-up
            </button>
          </div>
        )}
        {error && <p className="text-red-600">{error}</p>}
      </div>
    );
  }

  if (!open) {
    return <p className="text-sm text-neutral-600">{closedReason ?? "Sign-up is closed."}</p>;
  }

  if (signedIn) {
    return (
      <form
        className="flex flex-col gap-2 text-sm"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await call(`/api/care-events/${eventId}/signup`, "POST", {
              timeslot: toTimeslot(from, until),
            });
            router.refresh();
          });
        }}
      >
        <TimeslotFields from={from} until={until}
          onChange={(f, u) => { setFrom(f); setUntil(u); }} />
        <div>
          <button type="submit" disabled={pending}
            className="rounded-md bg-neutral-900 px-4 py-2 font-medium text-white disabled:opacity-50">
            {pending ? "Signing up…" : "Sign me up"}
          </button>
        </div>
        {error && <p className="text-red-600">{error}</p>}
      </form>
    );
  }

  if (!guestAllowed) {
    return <p className="text-sm text-neutral-600">Sign in to join this event.</p>;
  }

  if (notice) return <p className="text-sm text-green-700">{notice}</p>;

  return (
    <form className="flex flex-col gap-2 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        void run(async () => {
          const body = await call(`/api/care-events/${eventId}/guest-signup`, "POST", {
            name,
            email,
            timeslot: toTimeslot(from, until),
          });
          setNotice(body.message ?? "Check your email to confirm.");
        });
      }}>
      <p className="text-neutral-600">
        Sign up with your name and email. We&apos;ll email a link to confirm, which
        also lets you set a password.
      </p>
      <input required placeholder="Your name" maxLength={80}
        className="rounded-md border border-neutral-300 px-3 py-2"
        value={name} onChange={(e) => setName(e.target.value)} />
      <input required type="email" placeholder="Email" maxLength={254}
        className="rounded-md border border-neutral-300 px-3 py-2"
        value={email} onChange={(e) => setEmail(e.target.value)} />
      <TimeslotFields from={from} until={until}
        onChange={(f, u) => { setFrom(f); setUntil(u); }} />
      {error && <p className="text-red-600">{error}</p>}
      <div>
        <button type="submit" disabled={pending}
          className="rounded-md bg-neutral-900 px-4 py-2 font-medium text-white disabled:opacity-50">
          {pending ? "Sending…" : "Sign up"}
        </button>
      </div>
    </form>
  );
}
