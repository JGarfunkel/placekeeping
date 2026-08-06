"use client";

import type { GroupStewardType } from "@placekeeping/shared-types";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { groupStewardTypeOptions } from "./stewardOptions";

export function CreateGroupStewardForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState<GroupStewardType>("club");
  const [url, setUrl] = useState("");
  const [contact, setContact] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/stewards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          type,
          url: url || null,
          contact: contact || null,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Failed to create group");
      router.push(`/stewards/${body.steward.slug}/manage`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
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

      <label className="flex flex-col gap-1 text-sm">
        Type
        <select
          className="rounded-md border border-neutral-300 px-3 py-2"
          value={type}
          onChange={(e) => setType(e.target.value as GroupStewardType)}
        >
          {groupStewardTypeOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>

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

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-fit rounded-md bg-neutral-900 px-4 py-2 font-medium text-white disabled:opacity-50"
      >
        {pending ? "Creating…" : "Create group"}
      </button>
    </form>
  );
}
