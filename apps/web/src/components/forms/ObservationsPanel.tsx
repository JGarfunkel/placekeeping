"use client";

import {
  OBSERVATION_EDIT_WINDOW_MS,
  type Observation,
  type Vegetation,
  type WeedLevel,
} from "@placekeeping/shared-types";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { resolveObservationPin } from "@/lib/pins/resolveObservationPin";
import { renderPin } from "@/lib/pins/renderPin";
import { AddObservationDialog } from "./AddObservationDialog";
import { EditObservationDialog } from "./EditObservationDialog";

// Mirrors auth.canEditObservation server-side -- the server is the real
// gate (see the PATCH route), this just decides whether to show the pencil
// at all so it doesn't invite a click that's just going to 403.
function canEditObservation(
  obs: Observation,
  currentUserId: string | null,
): boolean {
  if (!currentUserId || obs.observerId !== currentUserId) return false;
  const ageMs = Date.now() - new Date(obs.createdAt).getTime();
  return ageMs >= 0 && ageMs < OBSERVATION_EDIT_WINDOW_MS;
}

function PhotoLightbox({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <img
        src={url}
        alt="Observation photo"
        className="h-[90vh] w-[90vw] object-contain"
      />
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-4 text-3xl text-white hover:text-neutral-300"
      >
        ✕
      </button>
    </div>
  );
}

function PhotoThumbnail({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);

  if (failed) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="text-xs underline">
        Photo
      </a>
    );
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        <img
          src={url}
          alt="Observation photo"
          className="h-24 w-24 rounded-md border border-neutral-200 object-cover"
          onError={() => setFailed(true)}
        />
      </button>
      {open && <PhotoLightbox url={url} onClose={() => setOpen(false)} />}
    </>
  );
}

function ObservationGlyph({ obs }: { obs: Observation }) {
  const spec = resolveObservationPin(obs);
  if (!spec) return null;

  return (
    <div
      className="h-[38px] w-7 shrink-0"
      title={obs.weedLevel ? `${obs.vegetation}, ${obs.weedLevel}` : obs.vegetation ?? undefined}
      dangerouslySetInnerHTML={{ __html: renderPin(spec) }}
    />
  );
}

// "Become a Steward" mirrors BecomeStewardButton's request but stays local
// to this row rather than a full-page action -- claiming stewardship right
// after needs a router.refresh() anyway, so both buttons share one pending/
// error state instead of composing two separate components.
function StewardshipActions({
  spotId,
  obs,
  currentStewardId,
}: {
  spotId: number;
  obs: Observation;
  currentStewardId: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<"steward" | "claim" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const alreadyClaimed = currentStewardId !== null && obs.stewardId === currentStewardId;

  async function becomeSteward() {
    setError(null);
    setPending("steward");
    try {
      const res = await fetch("/api/stewards/me", { method: "POST" });
      if (!res.ok) throw new Error("Failed to sign up as a steward");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setPending(null);
    }
  }

  async function logStewardshipActivity() {
    setError(null);
    setPending("claim");
    try {
      const res = await fetch(
        `/api/spots/${spotId}/observations/${obs.observationId}/claim-stewardship`,
        { method: "POST" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          typeof body?.error === "string" ? body.error : "Failed to log stewardship activity",
        );
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {!currentStewardId && (
        <button
          type="button"
          onClick={becomeSteward}
          disabled={pending !== null}
          className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700 hover:border-neutral-400 disabled:opacity-50"
        >
          {pending === "steward" ? "Signing up…" : "Become a Steward"}
        </button>
      )}
      <button
        type="button"
        onClick={logStewardshipActivity}
        disabled={pending !== null || !currentStewardId || alreadyClaimed}
        title={!currentStewardId ? "Become a steward first" : undefined}
        className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700 hover:border-neutral-400 disabled:opacity-50"
      >
        {alreadyClaimed
          ? "Stewardship logged ✓"
          : pending === "claim"
            ? "Logging…"
            : "Log Stewardship Activity"}
      </button>
      {error && <p className="w-full text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function ObservationsPanel({
  spotId,
  spotName,
  spotVegetation,
  spotWeedLevel,
  observations,
  observerName,
  currentUserId,
  currentStewardId,
}: {
  spotId: number;
  spotName: string;
  spotVegetation: Vegetation | null;
  spotWeedLevel: WeedLevel;
  observations: Observation[];
  observerName: string | null;
  currentUserId: string | null;
  currentStewardId: string | null;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingObservation, setEditingObservation] = useState<Observation | null>(
    null,
  );

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-medium">Observations</h2>

      <ul className="flex flex-col gap-4">
        {observerName && (
          <li>
            <button
              type="button"
              onClick={() => setDialogOpen(true)}
              className="w-full rounded-md border border-dashed border-neutral-300 p-3 text-left text-sm font-medium text-neutral-600 hover:border-neutral-400 hover:text-neutral-900"
            >
              + Add observation
            </button>
          </li>
        )}
        {observations.map((obs) => (
          <li
            key={obs.observationId}
            className="rounded-md border border-neutral-200 p-4"
          >
            <div className="flex items-center justify-between text-sm text-neutral-500">
              <div className="flex items-center gap-3">
                <ObservationGlyph obs={obs} />
                <span className="text-lg font-bold text-neutral-700">
                  {obs.observedAt}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {obs.observerName && <span>{obs.observerName}</span>}
                {canEditObservation(obs, currentUserId) && (
                  <button
                    type="button"
                    onClick={() => setEditingObservation(obs)}
                    aria-label="Edit observation"
                    title="Edit observation"
                    className="text-neutral-400 hover:text-neutral-900"
                  >
                    ✎
                  </button>
                )}
              </div>
            </div>
            {obs.notes && <p className="mt-1 text-sm">{obs.notes}</p>}
            {canEditObservation(obs, currentUserId) && (
              <StewardshipActions
                spotId={spotId}
                obs={obs}
                currentStewardId={currentStewardId}
              />
            )}
            {obs.photoUrls.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {obs.photoUrls.map((url) => (
                  <PhotoThumbnail key={url} url={url} />
                ))}
              </div>
            )}
          </li>
        ))}
        {observations.length === 0 && (
          <li className="text-sm text-neutral-500">
            No observations logged yet.
          </li>
        )}
      </ul>

      {dialogOpen && observerName && (
        <AddObservationDialog
          spotId={spotId}
          spotName={spotName}
          spotVegetation={spotVegetation}
          spotWeedLevel={spotWeedLevel}
          observerName={observerName}
          currentStewardId={currentStewardId}
          onClose={() => setDialogOpen(false)}
        />
      )}

      {editingObservation && observerName && (
        <EditObservationDialog
          spotId={spotId}
          spotName={spotName}
          observerName={observerName}
          observation={editingObservation}
          onClose={() => setEditingObservation(null)}
        />
      )}
    </div>
  );
}
