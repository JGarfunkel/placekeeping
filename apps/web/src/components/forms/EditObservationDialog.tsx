"use client";

import type { Observation } from "@placekeeping/shared-types";
import { ObservationForm } from "./ObservationForm";

export function EditObservationDialog({
  spotId,
  spotName,
  observerName,
  observation,
  onClose,
}: {
  spotId: number;
  spotName: string;
  observerName: string;
  observation: Observation;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-md bg-white p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Edit observation</p>
            <p className="text-xs text-neutral-500">{spotName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-neutral-500 hover:text-neutral-900"
          >
            ✕
          </button>
        </div>

        <ObservationForm
          spotId={spotId}
          observerName={observerName}
          observation={observation}
          onSuccess={onClose}
        />
      </div>
    </div>
  );
}
