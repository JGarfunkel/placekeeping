"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Target = { siteId: number } | { spotId: number };

type EditableEvent = {
  id: string;
  title: string;
  description: string;
  startAt: string;
  endAt: string;
  locationText: string;
  url: string | null;
  visibility: string;
  signupOpen: boolean;
  whatToBring: string;
  notesForVolunteers: string;
};

// <input type="datetime-local"> wants "YYYY-MM-DDTHH:mm" in the browser's
// zone; the form sends back an absolute ISO instant plus that zone's name.
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const inputClass = "rounded-md border border-neutral-300 px-3 py-2";

export function EventForm(
  props: { target: Target; event?: undefined } | { event: EditableEvent; target?: undefined },
) {
  const router = useRouter();
  const existing = props.event;
  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [startAt, setStartAt] = useState(existing ? toLocalInput(existing.startAt) : "");
  const [endAt, setEndAt] = useState(existing ? toLocalInput(existing.endAt) : "");
  const [locationText, setLocationText] = useState(existing?.locationText ?? "");
  const [url, setUrl] = useState(existing?.url ?? "");
  const [visibility, setVisibility] = useState(existing?.visibility ?? "public");
  const [signupOpen, setSignupOpen] = useState(existing?.signupOpen ?? true);
  const [whatToBring, setWhatToBring] = useState(existing?.whatToBring ?? "");
  const [notes, setNotes] = useState(existing?.notesForVolunteers ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const fields = {
        title,
        description,
        startAt: new Date(startAt).toISOString(),
        endAt: new Date(endAt).toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        locationText,
        url: url.trim() || null,
        visibility,
        signupOpen,
        whatToBring,
        notesForVolunteers: notes,
      };
      const res = await fetch(
        existing ? `/api/care-events/${existing.id}` : "/api/care-events",
        {
          method: existing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(existing ? fields : { ...props.target, ...fields }),
        },
      );
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          typeof body?.error === "string"
            ? body.error
            : "Please check the form and try again.",
        );
      }
      const id = existing?.id ?? body.event.id;
      router.push(`/events/${id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        Title
        <input required maxLength={120} className={inputClass} value={title}
          onChange={(e) => setTitle(e.target.value)} />
      </label>
      <div className="flex flex-wrap gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Starts
          <input required type="datetime-local" className={inputClass} value={startAt}
            onChange={(e) => setStartAt(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Ends
          <input required type="datetime-local" className={inputClass} value={endAt}
            onChange={(e) => setEndAt(e.target.value)} />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        What are we doing here?
        <textarea rows={4} maxLength={4000} className={inputClass} value={description}
          onChange={(e) => setDescription(e.target.value)} />
        <span className="text-xs text-neutral-500">Plain text, no links.</span>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Where to meet
        <input maxLength={300} className={inputClass} value={locationText}
          onChange={(e) => setLocationText(e.target.value)} />
        <span className="text-xs text-neutral-500">
          Only shown as precisely as the place&apos;s address setting allows.
        </span>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Link to more information (optional)
        <input type="url" maxLength={500} placeholder="https://" className={inputClass}
          value={url} onChange={(e) => setUrl(e.target.value)} />
        <span className="text-xs text-neutral-500">
          An outside page, such as a partner&apos;s listing or a sign-up sheet.
        </span>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        What to bring
        <input maxLength={1000} className={inputClass} value={whatToBring}
          onChange={(e) => setWhatToBring(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Notes for volunteers
        <textarea rows={3} maxLength={2000} className={inputClass} value={notes}
          onChange={(e) => setNotes(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Who can see this event
        <select className={inputClass} value={visibility}
          onChange={(e) => setVisibility(e.target.value)}>
          <option value="public">Anyone</option>
          <option value="members">Signed-in members only</option>
          <option value="managers">Managers only</option>
        </select>
        <span className="text-xs text-neutral-500">
          Places that aren&apos;t publicly accessible or hide their address are
          limited to members automatically.
        </span>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={signupOpen}
          onChange={(e) => setSignupOpen(e.target.checked)} />
        Sign-up is open
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div>
        <button type="submit" disabled={pending}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {pending ? "Saving…" : existing ? "Save changes" : "Schedule event"}
        </button>
      </div>
    </form>
  );
}
