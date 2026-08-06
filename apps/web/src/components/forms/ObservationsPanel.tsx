"use client";

import { OBSERVATION_EDIT_WINDOW_MS, type Observation } from "@placekeeping/shared-types";
import { useState } from "react";
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

function PhotoThumbnail({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="text-xs underline">
        Photo
      </a>
    );
  }

  return (
    <a href={url} target="_blank" rel="noreferrer">
      <img
        src={url}
        alt="Observation photo"
        className="h-24 w-24 rounded-md border border-neutral-200 object-cover"
        onError={() => setFailed(true)}
      />
    </a>
  );
}

export function ObservationsPanel({
  spotId,
  spotName,
  observations,
  observerName,
  currentUserId,
}: {
  spotId: number;
  spotName: string;
  observations: Observation[];
  observerName: string | null;
  currentUserId: string | null;
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
            className="rounded-md border border-neutral-200 p-3"
          >
            <div className="flex justify-between text-sm text-neutral-500">
              <span>{obs.observedAt}</span>
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
          observerName={observerName}
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
