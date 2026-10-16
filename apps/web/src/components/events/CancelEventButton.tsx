"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function CancelEventButton({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`/api/care-events/${eventId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(typeof body?.error === "string" ? body.error : "Failed to cancel");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="underline" onClick={() => setOpen(true)}>
        Cancel event
      </button>
    );
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-2 text-sm">
      <label className="flex flex-col gap-1">
        Reason (shown to everyone signed up, who will be emailed)
        <input required maxLength={500}
          className="rounded-md border border-neutral-300 px-3 py-2"
          value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      {error && <p className="text-red-600">{error}</p>}
      <div className="flex gap-3">
        <button type="submit" disabled={pending}
          className="rounded-md bg-red-700 px-4 py-2 font-medium text-white disabled:opacity-50">
          {pending ? "Canceling…" : "Cancel this event"}
        </button>
        <button type="button" className="underline" onClick={() => setOpen(false)}>
          Keep it
        </button>
      </div>
    </form>
  );
}
