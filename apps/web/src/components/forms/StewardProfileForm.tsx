"use client";

import { levelLabel, type StewardPrivate } from "@placekeeping/shared-types";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PhotoUploadField } from "./PhotoUploadField";

const stewardTypeLabels: Record<string, string> = {
  individual: "Individual",
  school: "School",
  club: "Club",
  nonprofit: "Nonprofit",
  municipality: "Municipality",
};

export function StewardProfileForm({
  steward,
  editEndpoint = "/api/stewards/me",
}: {
  steward: StewardPrivate;
  editEndpoint?: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(steward.name);
  const [url, setUrl] = useState(steward.url ?? "");
  const [contact, setContact] = useState(steward.contact ?? "");
  const [logoUrl, setLogoUrl] = useState(steward.logoUrl ?? "");
  const [publicDisplay, setPublicDisplay] = useState(steward.publicDisplay);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setPending(true);
    try {
      const res = await fetch(editEndpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          url: url || null,
          contact: contact || null,
          logoUrl: logoUrl || null,
          publicDisplay,
        }),
      });
      if (!res.ok) throw new Error("Failed to save profile");
      setSaved(true);
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
        Name
        <input
          required
          className="rounded-md border border-neutral-300 px-3 py-2"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>

      <p className="text-sm text-neutral-500">
        Type: {stewardTypeLabels[steward.type] ?? steward.type}
      </p>

      <p className="text-sm text-neutral-500">Level: {levelLabel(steward.level)}</p>

      <PhotoUploadField label="Logo" value={logoUrl} onChange={setLogoUrl} />

      <label className="flex flex-col gap-1 text-sm">
        Website
        <input
          type="url"
          placeholder="https://…"
          className="rounded-md border border-neutral-300 px-3 py-2"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Contact (private — never shown publicly)
        <input
          className="rounded-md border border-neutral-300 px-3 py-2"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
        />
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={publicDisplay}
          onChange={(e) => setPublicDisplay(e.target.checked)}
        />
        Show this steward publicly on spots it stewards
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && <p className="text-sm text-green-700">Saved.</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
