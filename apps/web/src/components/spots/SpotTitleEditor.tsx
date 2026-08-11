"use client";

import type { Spot } from "@placekeeping/shared-types";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

// Mirrors the canonical-URL logic in app/spots/[a]/page.tsx: a spot with a
// full slug lives at /spots/us/<state>/<locality>/<slug>, otherwise it's
// only reachable at /spots/<spotId>.
function spotPath(spot: Pick<Spot, "spotId" | "slugState" | "slugLocality" | "slug">): string {
  return spot.slugState && spot.slugLocality && spot.slug
    ? `/spots/us/${spot.slugState}/${spot.slugLocality}/${spot.slug}`
    : `/spots/${spot.spotId}`;
}

export function SpotTitleEditor({
  spotId,
  name,
  canEdit,
}: {
  spotId: number;
  name: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEditing() {
    setValue(name);
    setError(null);
    setIsEditing(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`/api/spots/${spotId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: value }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          body?.error ? JSON.stringify(body.error) : "Failed to save title",
        );
      }
      const { spot }: { spot: Spot } = await res.json();
      setIsEditing(false);
      const newPath = spotPath(spot);
      if (newPath !== pathname) {
        router.replace(newPath);
      } else {
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setPending(false);
    }
  }

  if (!canEdit) {
    return <h1 className="text-2xl font-semibold">{name}</h1>;
  }

  if (isEditing) {
    return (
      <form onSubmit={handleSave} className="flex flex-col gap-2">
        <input
          type="text"
          autoFocus
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-2xl font-semibold"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending || value.trim() === ""}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => setIsEditing(false)}
            disabled={pending}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-50"
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <h1 className="text-2xl font-semibold">{name}</h1>
      <button
        type="button"
        onClick={startEditing}
        aria-label="Edit spot title"
        title="Edit spot title"
        className="text-neutral-500 hover:text-neutral-900"
      >
        ✎
      </button>
    </div>
  );
}
