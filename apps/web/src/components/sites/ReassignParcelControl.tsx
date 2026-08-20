"use client";

import type { Site } from "@placekeeping/shared-types";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Choice = number | "new" | "delete" | "";

// Admin/creator-only parcel actions inside SiteMapAndParcels' parcel list:
// move this parcel to a different (nearby) site, spin up a new site for it,
// or delete its linkage to this site outright -- one dropdown covering all
// three rather than a separate trash-bin button, since they're mutually
// exclusive choices about where this parcel belongs. Lazily loads the
// nearby site list (GET /api/sites) only once the picker is opened, same as
// ChangeParcelControl only fetching candidates once its session starts.
export function ReassignParcelControl({
  siteId,
  swisSblId,
  printKey,
}: {
  siteId: number;
  swisSblId: string;
  printKey: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sites, setSites] = useState<Site[] | null>(null);
  const [choice, setChoice] = useState<Choice>("");
  const [newSiteName, setNewSiteName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || sites) return;
    fetch(
      `/api/sites?nearSwisSblId=${encodeURIComponent(swisSblId)}&excludeSiteId=${siteId}`,
    )
      .then((res) => res.json())
      .then((body) => setSites(body.sites))
      .catch(() => setError("Failed to load nearby sites"));
  }, [open, sites, swisSblId, siteId]);

  function cancel() {
    setOpen(false);
    setChoice("");
    setNewSiteName("");
    setError(null);
  }

  async function handleGo() {
    if (choice === "") return;

    if (choice === "delete") {
      if (
        !window.confirm(
          `Delete parcel ${printKey ?? swisSblId} from this site?`,
        )
      ) {
        return;
      }
      setPending(true);
      setError(null);
      try {
        const res = await fetch(`/api/sites/${siteId}/parcels`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ swisSblId }),
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => null);
          throw new Error(
            typeof errBody?.error === "string"
              ? errBody.error
              : "Failed to delete parcel",
          );
        }
        cancel();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setPending(false);
      }
      return;
    }

    const label = choice === "new" ? newSiteName : "the selected site";
    if (!window.confirm(`Move parcel ${printKey ?? swisSblId} to ${label}?`)) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      const body =
        choice === "new"
          ? { swisSblId, newSite: { name: newSiteName, purpose: null } }
          : { swisSblId, siteId: choice };
      const res = await fetch(`/api/sites/${siteId}/parcels`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(
          typeof errBody?.error === "string"
            ? errBody.error
            : "Failed to move parcel",
        );
      }
      cancel();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Move or delete this parcel"
        title="Move or delete this parcel"
        className="text-neutral-600 hover:text-neutral-900"
      >
        <span aria-hidden="true">🔀︎</span>
      </button>
    );
  }

  const canSave =
    choice !== "" && (choice !== "new" || newSiteName.trim().length > 0);

  return (
    <span className="inline-flex flex-wrap items-center gap-1 text-xs">
      {!sites && !error && (
        <span className="text-neutral-500">Loading nearby sites…</span>
      )}
      {sites && (
        <select
          className="rounded border border-neutral-300 px-1 py-0.5"
          value={choice}
          onChange={(e) => {
            const v = e.target.value;
            setChoice(
              v === "new" || v === "delete" || v === ""
                ? v
                : Number(v),
            );
          }}
        >
          <option value="">Choose…</option>
          {sites.map((s) => (
            <option key={s.siteId} value={s.siteId}>
              Move to &quot;{s.name}&quot;
            </option>
          ))}
          <option value="new">Move to a new site</option>
          <option value="delete">Unlink Parcel</option>
        </select>
      )}
      {sites && sites.length === 0 && (
        <span className="text-neutral-500">
          No sites within a quarter mile
        </span>
      )}
      {choice === "new" && (
        <input
          className="w-28 rounded border border-neutral-300 px-1 py-0.5"
          placeholder="Site name"
          value={newSiteName}
          onChange={(e) => setNewSiteName(e.target.value)}
        />
      )}
      <button
        type="button"
        onClick={handleGo}
        disabled={!canSave || pending}
        className="font-medium text-neutral-900 underline disabled:opacity-50"
      >
        {pending ? (choice === "delete" ? "Removing…" : "Moving…") : "Go"}
      </button>
      <button
        type="button"
        onClick={cancel}
        disabled={pending}
        className="text-neutral-500 underline disabled:opacity-50"
      >
        Cancel
      </button>
      {error && <span className="text-red-600">{error}</span>}
    </span>
  );
}
