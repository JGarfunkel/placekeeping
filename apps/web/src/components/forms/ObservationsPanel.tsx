"use client";

import {
  OBSERVATION_EDIT_WINDOW_MS,
  type Observation,
  type Vegetation,
  type WeedLevel,
} from "@placekeeping/shared-types";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { resolveObservationPin } from "@/lib/pins/resolveObservationPin";
import { renderPin } from "@/lib/pins/renderPin";
import { observationPath, photoPath } from "@/lib/spotPath";
import { AddObservationDialog } from "./AddObservationDialog";
import { EditObservationDialog } from "./EditObservationDialog";

// obs.photos (from listObservationsForSpot's join against the `photos`
// table) gives each photo a stable id for permalinks/highlighting. Falls
// back to plain photoUrls (photoId: null, no deep-link icon) for any
// Observation that wasn't loaded through that join.
function photosForObservation(
  obs: Observation,
): Array<{ photoId: string | null; url: string }> {
  if (obs.photos && obs.photos.length > 0) {
    return obs.photos.map((p) => ({ photoId: p.photoId, url: p.url }));
  }
  return obs.photoUrls.map((url) => ({ photoId: null, url }));
}

// Mirrors auth.canEditObservation server-side -- the server is the real
// gate (see the PATCH route), this just decides whether to show the pencil
// at all so it doesn't invite a click that's just going to 403.
function canEditObservation(
  obs: Observation,
  currentUserId: string | null,
  isSystemAdmin: boolean,
): boolean {
  if (!currentUserId || obs.observerId !== currentUserId) return false;
  if (isSystemAdmin) return true;
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

// A plain, ordinary <a href> to the permalink -- no special click handling.
// Left-click navigates there; right-click brings up the browser's normal
// "copy link address" menu, same as any other link on the page.
function PermalinkIcon({ path, label }: { path: string; label: string }) {
  return (
    <a
      href={path}
      aria-label={label}
      title={label}
      className="text-neutral-400 hover:text-neutral-900"
    >
      🔗
    </a>
  );
}

// The big, in-page photo for an observation/photo permalink (see
// SpotDetailView's featuredPhoto) -- rendered as normal page content within
// ObservationsPanel, not a floating overlay: no modal, no click handler,
// just an image that's part of the actual document (crawlable, screenshot-
// able, no black backdrop covering the rest of the page).
//
// A landscape photo just fills the available width at its natural ratio. A
// portrait photo would otherwise render narrow and letterboxed either side
// (constrained by height, not width) -- crop it to a square instead so it
// actually fills the visible height area, matching a landscape photo's
// visual weight. Orientation isn't known until the image loads, so it
// starts landscape-styled and switches once naturalWidth/Height are in.
function FeaturedPhoto({ url }: { url: string }) {
  const [isPortrait, setIsPortrait] = useState(false);

  return (
    <img
      src={url}
      alt="Featured observation photo"
      onLoad={(e) =>
        setIsPortrait(e.currentTarget.naturalHeight > e.currentTarget.naturalWidth)
      }
      className={
        isPortrait
          ? "mx-auto aspect-square max-h-[80vh] max-w-full rounded-md border border-neutral-200 object-cover"
          : "max-h-[80vh] w-full rounded-md border border-neutral-200 object-contain"
      }
    />
  );
}

function PhotoThumbnail({
  photoId,
  url,
  linkPath,
  highlighted = false,
}: {
  photoId: string | null;
  url: string;
  linkPath: string | null;
  highlighted?: boolean;
}) {
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
      <div className="relative" id={photoId ? `photo-${photoId}` : undefined}>
        <button type="button" onClick={() => setOpen(true)}>
          <img
            src={url}
            alt="Observation photo"
            className={`h-24 w-24 rounded-md border object-cover ${
              highlighted ? "border-amber-400 ring-2 ring-amber-400" : "border-neutral-200"
            }`}
            onError={() => setFailed(true)}
          />
        </button>
        {linkPath && (
          <div className="absolute -right-1 -top-1 rounded-full bg-white p-0.5 shadow">
            <PermalinkIcon path={linkPath} label="Photo permalink" />
          </div>
        )}
      </div>
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
  spotSlug,
  spotVegetation,
  spotWeedLevel,
  observations,
  observerName,
  currentUserId,
  currentStewardId,
  isSystemAdmin = false,
  highlightObservationId,
  highlightPhotoId,
  featuredPhoto,
}: {
  spotId: number;
  spotName: string;
  spotSlug: {
    spotId: number;
    slugState: string | null;
    slugLocality: string | null;
    slug: string | null;
  };
  spotVegetation: Vegetation | null;
  spotWeedLevel: WeedLevel;
  observations: Observation[];
  observerName: string | null;
  currentUserId: string | null;
  currentStewardId: string | null;
  isSystemAdmin?: boolean;
  // Set when this panel is rendered from an observation or photo permalink
  // (see app/spots/[a]/[b]/[c]/[d]/[e]/page.tsx and .../[f]/page.tsx) -- the
  // matching card scrolls into view and highlights on mount, and a matching
  // photo's lightbox opens automatically.
  highlightObservationId?: string;
  highlightPhotoId?: string;
  // Set when this panel is rendered from a photo permalink -- rendered as a
  // big in-page image above the list (see FeaturedPhoto), instead of the
  // matching thumbnail's lightbox auto-opening as a floating overlay.
  featuredPhoto?: { photoId: string; url: string } | null;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingObservation, setEditingObservation] = useState<Observation | null>(
    null,
  );
  // Highlight fades after a few seconds so it reads as "here's the thing you
  // linked to", not a permanent marker.
  const [highlightActive, setHighlightActive] = useState(!!highlightObservationId);

  useEffect(() => {
    if (!highlightObservationId) return;
    document
      .getElementById(`obs-${highlightObservationId}`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
    const timer = setTimeout(() => setHighlightActive(false), 4000);
    return () => clearTimeout(timer);
  }, [highlightObservationId]);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-medium">Observations</h2>

      {featuredPhoto && <FeaturedPhoto url={featuredPhoto.url} />}

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
        {observations.map((obs) => {
          const isHighlighted = obs.observationId === highlightObservationId;
          return (
            <li
              key={obs.observationId}
              id={`obs-${obs.observationId}`}
              className={`rounded-md border p-4 transition-colors ${
                isHighlighted && highlightActive
                  ? "border-amber-400 bg-amber-50"
                  : "border-neutral-200"
              }`}
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
                  <PermalinkIcon
                    path={observationPath(spotSlug, obs.observationId)}
                    label="Observation permalink"
                  />
                  {canEditObservation(obs, currentUserId, isSystemAdmin) && (
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
              {canEditObservation(obs, currentUserId, isSystemAdmin) && (
                <StewardshipActions
                  spotId={spotId}
                  obs={obs}
                  currentStewardId={currentStewardId}
                />
              )}
              {(() => {
                const obsPhotos = photosForObservation(obs);
                if (obsPhotos.length === 0) return null;
                return (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {obsPhotos.map(({ photoId, url }) => (
                      <PhotoThumbnail
                        key={photoId ?? url}
                        photoId={photoId}
                        url={url}
                        linkPath={photoId ? photoPath(spotSlug, obs.observationId, photoId) : null}
                        highlighted={!!photoId && photoId === highlightPhotoId}
                      />
                    ))}
                  </div>
                );
              })()}
            </li>
          );
        })}
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
