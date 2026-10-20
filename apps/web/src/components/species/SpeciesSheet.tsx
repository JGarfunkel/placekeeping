"use client";

import {
  PLANT_ORGANS,
  type CropRect,
  type Identification,
  type IdentifyResult,
  type Observation,
  type ObservationPlant,
  type PlantOrgan,
  type Taxon,
} from "@placekeeping/shared-types";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// Species identification sheet (local/species-id.md): shows an observation's
// photo, lets the observer outline a plant with a rectangle (or use the whole
// photo), sends it to Pl@ntNet via the server, and lists candidates with
// Confirm / Reject. Everyone else sees confirmed species only.

// Dragging smaller than this (fraction of the photo) is treated as a tap,
// i.e. "no rectangle".
const MIN_DRAG_FRACTION = 0.03;

type SheetPhoto = {
  photoId: string;
  fullUrl: string;
  mediumUrl: string;
  thumbUrl: string;
  size: { w: number; h: number } | null;
};

function sheetPhotos(obs: Observation): SheetPhoto[] {
  return (obs.photos ?? []).map((p) => ({
    photoId: p.photoId,
    fullUrl: p.urls.original,
    mediumUrl: p.urls.medium,
    thumbUrl: p.urls.thumb,
    size: p.sizes.medium ?? p.sizes.original,
  }));
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof data?.error === "string" ? data.error : "Something went wrong.";
    throw new Error(message);
  }
  return data as T;
}

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

function rectStyle(crop: CropRect) {
  return {
    left: `${crop.x * 100}%`,
    top: `${crop.y * 100}%`,
    width: `${crop.w * 100}%`,
    height: `${crop.h * 100}%`,
  };
}

function displayName(taxon: Taxon): string {
  return taxon.commonName ?? taxon.scientificName;
}

function verifiedPlant(ident: Identification): ObservationPlant | undefined {
  return ident.plants.find((p) => p.status === "verified");
}

function CropThumb({ photo, crop }: { photo: SheetPhoto; crop: CropRect | null }) {
  const area = crop ?? { x: 0, y: 0, w: 1, h: 1 };
  const ratio = photo.size
    ? (area.w * photo.size.w) / (area.h * photo.size.h)
    : area.w / area.h;
  return (
    <div
      className="h-14 shrink-0 rounded border border-neutral-200 bg-neutral-100"
      style={{
        aspectRatio: String(Math.min(Math.max(ratio, 0.5), 2)),
        backgroundImage: `url(${photo.mediumUrl})`,
        backgroundSize: `${100 / area.w}% ${100 / area.h}%`,
        backgroundPosition: `${area.w >= 1 ? 0 : (area.x / (1 - area.w)) * 100}% ${
          area.h >= 1 ? 0 : (area.y / (1 - area.h)) * 100
        }%`,
      }}
    />
  );
}

export function SpeciesSheet({
  observation,
  canReview: canReviewHint,
  onClose,
}: {
  observation: Observation;
  // Whether this viewer can identify; the server is the real gate and its
  // answer (from the species GET) replaces this once loaded.
  canReview: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const photos = useMemo(() => sheetPhotos(observation), [observation]);
  const [photoId, setPhotoId] = useState<string | null>(photos[0]?.photoId ?? null);
  const photo = photos.find((p) => p.photoId === photoId) ?? null;

  const [identifications, setIdentifications] = useState<Identification[]>([]);
  const [canReview, setCanReview] = useState(canReviewHint);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [changed, setChanged] = useState(false);
  const [showRejected, setShowRejected] = useState(false);

  // null = automatic: draw mode while this photo has no species yet, list mode
  // once it does. "Add another species" / Cancel set it explicitly.
  const [addingState, setAddingState] = useState<boolean | null>(null);

  const [organ, setOrgan] = useState<PlantOrgan>("auto");
  const [draft, setDraft] = useState<CropRect | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  const [manualName, setManualName] = useState("");
  const [suggestions, setSuggestions] = useState<Taxon[]>([]);

  useEffect(() => {
    let cancelled = false;
    api<{ identifications: Identification[]; canReview: boolean }>(
      `/api/observations/${observation.observationId}/species`,
    )
      .then((data) => {
        if (cancelled) return;
        setIdentifications(data.identifications);
        setCanReview(data.canReview);
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [observation.observationId]);

  // Name suggestions for manual entry, from taxa the app already knows.
  useEffect(() => {
    const q = manualName.trim();
    if (q.length < 2) return;
    const timer = setTimeout(() => {
      api<{ taxa: Taxon[] }>(`/api/taxa/search?q=${encodeURIComponent(q)}`)
        .then((data) => setSuggestions(data.taxa))
        .catch(() => setSuggestions([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [manualName]);

  const close = useCallback(() => {
    if (changed) router.refresh();
    onClose();
  }, [changed, onClose, router]);

  const upsertIdentification = useCallback((ident: Identification) => {
    setIdentifications((prev) =>
      prev.some((i) => i.identificationId === ident.identificationId)
        ? prev.map((i) => (i.identificationId === ident.identificationId ? ident : i))
        : [...prev, ident],
    );
    setChanged(true);
  }, []);

  // --- rectangle drawing ---------------------------------------------------

  function pointFromEvent(e: React.PointerEvent): { x: number; y: number } {
    const rect = frameRef.current!.getBoundingClientRect();
    return {
      x: clamp01((e.clientX - rect.left) / rect.width),
      y: clamp01((e.clientY - rect.top) / rect.height),
    };
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!drawing || busy) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStart.current = pointFromEvent(e);
    setDraft(null);
    setNotice(null);
  }

  function onPointerMove(e: React.PointerEvent) {
    const start = dragStart.current;
    if (!start) return;
    const p = pointFromEvent(e);
    setDraft({
      x: Math.min(start.x, p.x),
      y: Math.min(start.y, p.y),
      w: Math.abs(p.x - start.x),
      h: Math.abs(p.y - start.y),
    });
  }

  function onPointerUp() {
    dragStart.current = null;
    setDraft((d) =>
      d && d.w >= MIN_DRAG_FRACTION && d.h >= MIN_DRAG_FRACTION ? d : null,
    );
  }

  // --- actions -------------------------------------------------------------

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function identify() {
    if (!photoId) return;
    void run(async () => {
      const result = await api<IdentifyResult>(
        `/api/observations/${observation.observationId}/identify`,
        { method: "POST", body: JSON.stringify({ photoId, crop: draft, organ }) },
      );
      upsertIdentification(result.identification);
      setDraft(null);
      setAddingState(null);
      if (result.noMatch) {
        setNotice("No confident match. Try a closer shot, or enter the name below.");
      }
    });
  }

  function addManual() {
    const name = manualName.trim();
    if (!photoId || name.length < 2) return;
    const known = suggestions.find(
      (t) =>
        t.scientificName.toLowerCase() === name.toLowerCase() ||
        t.commonName?.toLowerCase() === name.toLowerCase(),
    );
    void run(async () => {
      const data = await api<{ identification: Identification }>(
        `/api/observations/${observation.observationId}/species/manual`,
        {
          method: "POST",
          body: JSON.stringify({
            photoId,
            crop: draft,
            scientificName: known?.scientificName ?? name,
            commonName: known?.commonName ?? undefined,
          }),
        },
      );
      upsertIdentification(data.identification);
      setDraft(null);
      setAddingState(null);
      setManualName("");
      setSuggestions([]);
    });
  }

  function decide(kind: "confirm" | "reject", ident: Identification, plant: ObservationPlant) {
    void run(async () => {
      const data = await api<{ identification: Identification }>(
        `/api/identifications/${ident.identificationId}/${kind}`,
        { method: "POST", body: JSON.stringify({ observationPlantId: plant.observationPlantId }) },
      );
      upsertIdentification(data.identification);
    });
  }

  // --- render --------------------------------------------------------------

  const forPhoto = identifications.filter((i) => i.photoId === photoId);
  const visible = forPhoto
    .map((i) => ({
      ...i,
      plants: showRejected ? i.plants : i.plants.filter((p) => p.status !== "rejected"),
    }))
    .filter((i) => i.plants.length > 0);
  const hasRejected = forPhoto.some((i) => i.plants.some((p) => p.status === "rejected"));
  const hasLive = forPhoto.some((i) => i.plants.some((p) => p.status !== "rejected"));
  const drawing = canReview && (addingState ?? (!loading && !hasLive));

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-end justify-center bg-black/40 sm:items-center sm:px-4"
      onClick={close}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-4xl flex-col rounded-t-lg bg-white shadow-lg sm:rounded-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-neutral-200 p-4">
          <div>
            <p className="text-sm font-medium">Species</p>
            <p className="text-xs text-neutral-500">{observation.observedAt}</p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="text-neutral-500 hover:text-neutral-900"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto p-4">
          {!photo ? (
            <p className="text-sm text-neutral-500">
              This observation has no photos to identify from.
            </p>
          ) : (
            <>
              {photos.length > 1 && (
                <div className="flex gap-2 overflow-x-auto">
                  {photos.map((p) => (
                    <button
                      key={p.photoId}
                      type="button"
                      onClick={() => {
                        setPhotoId(p.photoId);
                        setDraft(null);
                        setAddingState(null);
                      }}
                      className={`h-12 w-12 shrink-0 overflow-hidden rounded border-2 ${
                        p.photoId === photoId ? "border-neutral-900" : "border-transparent"
                      }`}
                    >
                      <img src={p.thumbUrl} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              )}

              <div className="flex justify-center rounded bg-neutral-100">
                <div
                  ref={frameRef}
                  className={`relative inline-block max-w-full select-none ${
                    drawing ? "cursor-crosshair" : ""
                  }`}
                  style={{ touchAction: drawing ? "none" : "auto" }}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                >
                  <img
                    src={photo.fullUrl}
                    alt="Observation photo"
                    draggable={false}
                    className="block max-h-[90vh] max-w-full"
                  />
                  {forPhoto.map((ident) => {
                    if (!ident.crop) return null;
                    const verified = verifiedPlant(ident);
                    const live = ident.plants.some((p) => p.status !== "rejected");
                    if (!live) return null;
                    return (
                      <div
                        key={ident.identificationId}
                        className={`pointer-events-none absolute border-2 ${
                          verified ? "border-green-500" : "border-amber-400 border-dashed"
                        }`}
                        style={rectStyle(ident.crop)}
                      >
                        {verified && (
                          <span className="absolute left-0 top-0 max-w-full truncate bg-green-600 px-1 text-[11px] leading-4 text-white">
                            {displayName(verified.taxon)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                  {draft && (
                    <div
                      className="pointer-events-none absolute border-2 border-sky-500 bg-sky-400/20"
                      style={rectStyle(draft)}
                    />
                  )}
                </div>
              </div>

              {drawing && (
                <div className="flex flex-col gap-3">
                  <p className="text-xs text-neutral-500">
                    {draft
                      ? "Rectangle drawn. Identify it, or draw again."
                      : "Drag a rectangle around one plant, or identify the whole photo."}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={organ}
                      onChange={(e) => setOrgan(e.target.value as PlantOrgan)}
                      aria-label="Plant part shown"
                      className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
                    >
                      {PLANT_ORGANS.map((o) => (
                        <option key={o} value={o}>
                          {o === "auto" ? "Part: auto-detect" : `Part: ${o}`}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={identify}
                      disabled={busy}
                      className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
                    >
                      {busy ? "Working…" : draft ? "Identify rectangle" : "Identify photo"}
                    </button>
                    {draft && (
                      <button
                        type="button"
                        onClick={() => setDraft(null)}
                        className="text-sm text-neutral-500 underline hover:text-neutral-900"
                      >
                        Clear
                      </button>
                    )}
                    {hasLive && (
                      <button
                        type="button"
                        onClick={() => {
                          setAddingState(false);
                          setDraft(null);
                        }}
                        className="text-sm text-neutral-500 underline hover:text-neutral-900"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {error && (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          {notice && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">{notice}</p>}

          {loading ? (
            <p className="text-sm text-neutral-500">Loading…</p>
          ) : (
            <ul className="flex flex-col gap-4">
              {visible.map((ident) => (
                <li key={ident.identificationId} className="flex gap-3">
                  {photo && <CropThumb photo={photo} crop={ident.crop} />}
                  <ul className="flex min-w-0 flex-1 flex-col gap-2">
                    {ident.plants.map((plant) => (
                      <li
                        key={plant.observationPlantId}
                        className={`flex items-center justify-between gap-2 rounded-md border p-2 ${
                          plant.status === "verified"
                            ? "border-green-300 bg-green-50"
                            : plant.status === "rejected"
                              ? "border-neutral-200 opacity-60"
                              : "border-neutral-200"
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {displayName(plant.taxon)}
                            {plant.status === "verified" && (
                              <span className="ml-2 text-xs font-normal text-green-700">
                                ✓ confirmed
                              </span>
                            )}
                          </p>
                          <p className="truncate text-xs italic text-neutral-500">
                            {plant.taxon.scientificName}
                            {plant.score !== null && (
                              <span className="not-italic"> · {Math.round(plant.score * 100)}%</span>
                            )}
                            {plant.source === "keeper" && (
                              <span className="not-italic"> · entered by name</span>
                            )}
                          </p>
                        </div>
                        {canReview && (
                          <div className="flex shrink-0 gap-2 text-xs">
                            {plant.status !== "verified" && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => decide("confirm", ident, plant)}
                                className="rounded border border-green-600 px-2 py-1 font-medium text-green-700 hover:bg-green-100 disabled:opacity-50"
                              >
                                Confirm
                              </button>
                            )}
                            {plant.status !== "rejected" && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => decide("reject", ident, plant)}
                                className="rounded border border-neutral-300 px-2 py-1 text-neutral-600 hover:bg-neutral-100 disabled:opacity-50"
                              >
                                Reject
                              </button>
                            )}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
              {visible.length === 0 && (
                <li className="text-sm text-neutral-500">
                  {canReview ? "No species yet for this photo." : "No confirmed species yet."}
                </li>
              )}
            </ul>
          )}

          {canReview && photo && !drawing && !loading && (
            <button
              type="button"
              onClick={() => setAddingState(true)}
              className="self-start rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:border-neutral-400 hover:bg-neutral-50"
            >
              + Add another species
            </button>
          )}

          {canReview && hasRejected && (
            <label className="flex items-center gap-2 text-xs text-neutral-600">
              <input
                type="checkbox"
                checked={showRejected}
                onChange={(e) => setShowRejected(e.target.checked)}
              />
              Show rejected
            </label>
          )}

          {drawing && photo && (
            <form
              className="flex flex-col gap-2 border-t border-neutral-200 pt-3"
              onSubmit={(e) => {
                e.preventDefault();
                addManual();
              }}
            >
              <label htmlFor="species-manual" className="text-xs font-medium text-neutral-600">
                Or enter a name{draft ? " for the rectangle" : ""}
              </label>
              <div className="flex gap-2">
                <input
                  id="species-manual"
                  list="species-manual-options"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  placeholder="Common or scientific name"
                  maxLength={200}
                  className="min-w-0 flex-1 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
                />
                <datalist id="species-manual-options">
                  {suggestions.map((t) => (
                    <option key={t.taxonId} value={t.scientificName}>
                      {t.commonName ?? ""}
                    </option>
                  ))}
                </datalist>
                <button
                  type="submit"
                  disabled={busy || manualName.trim().length < 2}
                  className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-100 disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            </form>
          )}
        </div>

        <div className="border-t border-neutral-200 px-4 py-2 text-[11px] text-neutral-500">
          Suggestions by{" "}
          <a
            href="https://plantnet.org"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-neutral-900"
          >
            Pl@ntNet
          </a>
          . Always check them against the plant.
        </div>
      </div>
    </div>
  );
}
