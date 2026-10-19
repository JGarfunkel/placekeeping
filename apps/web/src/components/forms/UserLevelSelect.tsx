"use client";

import { knownLevelValues, levelLabel } from "@placekeeping/shared-types";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function UserLevelSelect({
  userId,
  initialLevel,
}: {
  userId: string;
  initialLevel: number;
}) {
  const router = useRouter();
  const [level, setLevel] = useState(initialLevel);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // A level outside the known range (set via db:set-level) still shows up
  // as its own option so the select reflects the stored value.
  const options: number[] = (knownLevelValues as readonly number[]).includes(
    initialLevel,
  )
    ? [...knownLevelValues]
    : [...knownLevelValues, initialLevel];

  async function change(next: number) {
    const previous = level;
    setError(null);
    setPending(true);
    setLevel(next);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level: next }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Failed to update level");
      router.refresh();
    } catch (err) {
      setLevel(previous);
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <select
        value={level}
        disabled={pending}
        onChange={(e) => change(Number(e.target.value))}
        className="rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50"
      >
        {options.map((l) => (
          <option key={l} value={l}>
            {l} – {levelLabel(l)}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
