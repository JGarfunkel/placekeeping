"use client";

import {
  OBSERVATION_EDIT_WINDOW_MS,
  type Focus,
  type Observation,
  type Photo,
  type WeedLevel,
} from "@placekeeping/shared-types";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { focusOptions } from "@/components/forms/spotOptions";
import { resolveObservationPin } from "@/lib/pins/resolveObservationPin";
import { renderPin } from "@/lib/pins/renderPin";
import { observationPath, photoPath } from "@/lib/spotPath";
import { AddObservationDialog } from "./AddObservationDialog";
import { GsvAddPanel } from "./GsvAddPanel";
import { requestCreateTask } from "@/lib/taskEvents";
import { SpeciesSheet } from "@/components/species/SpeciesSheet";
import { EditObservationDialog } from "./EditObservationDialog";

// obs.photos (from listObservationsForSpot's join against the `photos`
// table) gives each photo a stable id for permalinks/highlighting. Falls
// back to plain photoUrls (photoId: null, no deep-link icon) for any
// Observation that wasn't loaded through that join. `url` is the original
// (lightbox); `thumbUrl` is the small copy for the grid, which equals `url`
// when a photo has no derived copies.
// `portrait` is only ever true for a photo with stored dimensions, so legacy
// and external-URL photos (no dimensions, nothing of ours to rewrite) never
// get the edit glyphs.
function photosForObservation(obs: Observation): Array<{
  photoId: string | null;
  url: string;
  thumbUrl: string;
  portrait: boolean;
}> {
  if (obs.photos && obs.photos.length > 0) {
    return obs.photos.map((p) => ({
      photoId: p.photoId,
      url: p.urls.original,
      thumbUrl: p.urls.thumb,
      portrait: !!p.sizes.original && p.sizes.original.h > p.sizes.original.w,
    }));
  }
  return obs.photoUrls.map((url) => ({ photoId: null, url, thumbUrl: url, portrait: false }));
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

// Mirrors species.canIdentifyObservation server-side (the author, or a
// system admin) -- the server is the real gate, this only decides which
// button to show.
function canIdentifySpecies(
  obs: Observation,
  currentUserId: string | null,
  isSystemAdmin: boolean,
): boolean {
  if (!currentUserId) return false;
  return isSystemAdmin || obs.observerId === currentUserId;
}

// "Identify species", with a check once species have been verified (see
// local/species-id.md). null when there is nothing for this viewer to do.
function speciesButtonLabel(obs: Observation, canIdentify: boolean): string | null {
  const counts = obs.speciesCounts ?? { verified: 0, suggested: 0 };
  if (counts.verified > 0) return "Identify species ✓";
  if (!canIdentify) return null;
  if (counts.suggested > 0) return "Identify species";
  return (obs.photos?.length ?? 0) > 0 ? "Identify species" : null;
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
function FeaturedPhoto({ photo }: { photo: Photo }) {
  const [isPortrait, setIsPortrait] = useState(false);
  const size = photo.sizes.medium;

  return (
    <img
      src={photo.urls.medium}
      width={size?.w}
      height={size?.h}
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
  thumbUrl,
  linkPath,
  highlighted = false,
  canEditPortrait = false,
  canMove = false,
  observedAt,
}: {
  photoId: string | null;
  url: string;
  thumbUrl: string;
  linkPath: string | null;
  highlighted?: boolean;
  // Show the rotate / square-crop glyphs (portrait photos the viewer can edit).
  canEditPortrait?: boolean;
  // Show the move-to-new-observation glyph (photos the viewer can edit);
  // observedAt is the current observation's date, offered as the default.
  canMove?: boolean;
  observedAt?: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  // If the thumb object is unreachable, fall back to the original before
  // giving up on the photo entirely.
  const [thumbFailed, setThumbFailed] = useState(false);
  const [open, setOpen] = useState(false);

  if (failed) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="text-xs underline">
        Photo
      </a>
    );
  }

  async function edit(op: "rotate" | "square") {
    if (!photoId) return;
    if (
      op === "square" &&
      !window.confirm("Crop this photo to a square? The cropped-off edges are removed permanently.")
    ) {
      return;
    }
    setEditError(null);
    setEditing(true);
    try {
      const res = await fetch(`/api/photos/${photoId}/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(typeof body?.error === "string" ? body.error : "Failed to edit photo");
      }
      router.refresh();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setEditing(false);
    }
  }

  async function move() {
    if (!photoId) return;
    const date = window.prompt(
      "Move this photo to a new observation dated (YYYY-MM-DD):",
      observedAt,
    );
    if (date === null) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
      setEditError("Enter a date as YYYY-MM-DD");
      return;
    }
    setEditError(null);
    setEditing(true);
    try {
      const res = await fetch(`/api/photos/${photoId}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ observedAt: date.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(typeof body?.error === "string" ? body.error : "Failed to move photo");
      }
      router.refresh();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setEditing(false);
    }
  }

  return (
    <>
      <div className="relative" id={photoId ? `photo-${photoId}` : undefined}>
        <button type="button" onClick={() => setOpen(true)}>
          <img
            src={thumbFailed ? url : thumbUrl}
            alt="Observation photo"
            loading="lazy"
            className={`h-24 w-24 rounded-md border object-cover ${
              highlighted ? "border-amber-400 ring-2 ring-amber-400" : "border-neutral-200"
            }`}
            onError={() => {
              if (!thumbFailed && thumbUrl !== url) setThumbFailed(true);
              else setFailed(true);
            }}
          />
        </button>
        {linkPath && (
          <div className="absolute -right-1 -top-1 rounded-full bg-white p-0.5 shadow">
            <PermalinkIcon path={linkPath} label="Photo permalink" />
          </div>
        )}
        {(canEditPortrait || canMove) && photoId && (
          <div className="absolute bottom-1 left-1 flex gap-1">
            {canEditPortrait && (
              <>
                <button
                  type="button"
                  onClick={() => edit("rotate")}
                  disabled={editing}
                  aria-label="Rotate to landscape"
                  title="Rotate to landscape"
                  className="rounded-full bg-white/90 px-1.5 text-sm text-neutral-600 shadow hover:text-neutral-900 disabled:opacity-50"
                >
                  ↻
                </button>
                <button
                  type="button"
                  onClick={() => edit("square")}
                  disabled={editing}
                  aria-label="Crop to square"
                  title="Crop to square"
                  className="rounded-full bg-white/90 px-1.5 text-sm text-neutral-600 shadow hover:text-neutral-900 disabled:opacity-50"
                >
                  ▢
                </button>
              </>
            )}
            {canMove && (
              <button
                type="button"
                onClick={move}
                disabled={editing}
                aria-label="Move to a new observation"
                title="Move to a new observation (different date)"
                className="rounded-full bg-white/90 px-1.5 text-sm text-neutral-600 shadow hover:text-neutral-900 disabled:opacity-50"
              >
                📅
              </button>
            )}
          </div>
        )}
        {editError && <p className="mt-1 w-24 text-xs text-red-600">{editError}</p>}
      </div>
      {open && <PhotoLightbox url={url} onClose={() => setOpen(false)} />}
    </>
  );
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatCaptureMonth(captureDate: string): string {
  const [year, month] = captureDate.split("-");
  const name = MONTH_NAMES[Number(month) - 1];
  return name ? `${name} ${year}` : captureDate;
}

// A Street View pointer row: no observer, no steward glyph, no classification
// chips -- just the frame, its capture month and Google's attribution. Must
// branch before any of the stewardId-driven glyph logic.
function GsvObservationCard({
  obs,
  imageUrl,
  spotSlug,
  highlighted,
  spotId,
  isSystemAdmin,
}: {
  obs: Observation;
  imageUrl: string | null;
  spotSlug: Parameters<typeof observationPath>[0];
  highlighted: boolean;
  spotId: number;
  isSystemAdmin: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!window.confirm("Remove this Street View photo from the spot?")) return;
    setError(null);
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/spots/${spotId}/observations/${obs.observationId}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("Failed to delete");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setDeleting(false);
    }
  }
  if (!obs.gsvRef) return null;
  const title = `Google Street View, ${formatCaptureMonth(obs.gsvRef.captureDate)}`;
  return (
    <li
      id={`obs-${obs.observationId}`}
      className={`rounded-md border p-4 transition-colors ${
        highlighted ? "border-amber-400 bg-amber-50" : "border-neutral-200"
      }`}
    >
      <div className="flex items-center justify-between text-sm text-neutral-500">
        <span className="text-lg font-bold text-neutral-700">{title}</span>
        <div className="flex items-center gap-2">
          <PermalinkIcon
            path={observationPath(spotSlug, obs.observationId)}
            label="Observation permalink"
          />
          {isSystemAdmin && (
            <button
              type="button"
              onClick={remove}
              disabled={deleting}
              aria-label="Delete Street View photo"
              title="Delete Street View photo"
              className="text-neutral-400 hover:text-red-600 disabled:opacity-50"
            >
              🗑
            </button>
          )}
        </div>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {obs.notes && <p className="mt-1 text-sm">{obs.notes}</p>}
      {imageUrl && (
        <button type="button" onClick={() => setOpen(true)} className="mt-2 block w-full">
          <img
            src={imageUrl}
            alt={title}
            loading="lazy"
            className="w-full rounded-md border border-neutral-200 object-cover"
          />
        </button>
      )}
      <p className="mt-1 text-xs text-neutral-500">Imagery © Google</p>
      {open && imageUrl && <PhotoLightbox url={imageUrl} onClose={() => setOpen(false)} />}
    </li>
  );
}

function ObservationGlyph({ obs }: { obs: Observation }) {
  const spec = resolveObservationPin(obs);
  if (!spec) return null;

  const focusLabel = focusOptions.find((o) => o.value === obs.focus)?.label ?? obs.focus;

  return (
    <div
      className="h-[38px] w-7 shrink-0"
      title={obs.weedLevel ? `${focusLabel}, ${obs.weedLevel}` : (focusLabel ?? undefined)}
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
  children,
}: {
  spotId: number;
  obs: Observation;
  currentStewardId: string | null;
  children?: React.ReactNode;
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
      {children}
      {error && <p className="w-full text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function ObservationsPanel({
  spotId,
  spotName,
  spotSlug,
  spotFocus,
  spotWeedLevel,
  observations,
  gsvImageUrls = {},
  observerName,
  currentUserId,
  currentStewardId,
  isSystemAdmin = false,
  canCreateTasks = false,
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
  spotFocus: Focus | null;
  spotWeedLevel: WeedLevel;
  observations: Observation[];
  // Server-built thumbnail URLs for source === "gsv" rows, by observationId.
  gsvImageUrls?: Record<string, string>;
  observerName: string | null;
  currentUserId: string | null;
  currentStewardId: string | null;
  isSystemAdmin?: boolean;
  // Shows a "Create task" action on each observation (native tasks only).
  canCreateTasks?: boolean;
  // Set when this panel is rendered from an observation or photo permalink
  // (see app/spots/[a]/[b]/[c]/[d]/[e]/page.tsx and .../[f]/page.tsx) -- the
  // matching card scrolls into view and highlights on mount, and a matching
  // photo's lightbox opens automatically.
  highlightObservationId?: string;
  highlightPhotoId?: string;
  // Set when this panel is rendered from a photo permalink -- rendered as a
  // big in-page image above the list (see FeaturedPhoto), instead of the
  // matching thumbnail's lightbox auto-opening as a floating overlay.
  featuredPhoto?: Photo | null;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingObservation, setEditingObservation] = useState<Observation | null>(
    null,
  );
  const [speciesObservation, setSpeciesObservation] = useState<Observation | null>(null);
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

      {featuredPhoto && <FeaturedPhoto photo={featuredPhoto} />}

      <ul className="flex flex-col gap-4">
        {observerName && (
          <li className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setDialogOpen(true)}
              className="min-w-40 flex-1 rounded-md border border-dashed border-neutral-300 p-3 text-left text-sm font-medium text-neutral-600 hover:border-neutral-400 hover:text-neutral-900"
            >
              + Add observation
            </button>
            <GsvAddPanel spotId={spotId} />
          </li>
        )}
        {observations.map((obs) => {
          if (obs.source === "gsv") {
            return (
              <GsvObservationCard
                key={obs.observationId}
                obs={obs}
                imageUrl={gsvImageUrls[obs.observationId] ?? null}
                spotSlug={spotSlug}
                spotId={spotId}
                isSystemAdmin={isSystemAdmin}
                highlighted={
                  obs.observationId === highlightObservationId && highlightActive
                }
              />
            );
          }
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
                  {canCreateTasks && (
                    <button
                      type="button"
                      onClick={() =>
                        requestCreateTask({
                          title: `Follow up: ${spotName}`,
                          description: [
                            `From the ${obs.observedAt} observation.`,
                            obs.notes ?? "",
                            `Observation: ${observationPath(spotSlug, obs.observationId)}`,
                          ]
                            .filter(Boolean)
                            .join("\n"),
                          observationId: obs.observationId,
                        })
                      }
                      className="text-xs text-neutral-500 underline hover:text-neutral-900"
                    >
                      Create task
                    </button>
                  )}
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
              {(() => {
                const canIdentify = canIdentifySpecies(obs, currentUserId, isSystemAdmin);
                const label = speciesButtonLabel(obs, canIdentify);
                const speciesButton = label && (
                  <button
                    type="button"
                    onClick={() => setSpeciesObservation(obs)}
                    className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700 hover:border-neutral-400"
                  >
                    🌱 {label}
                  </button>
                );
                if (canEditObservation(obs, currentUserId, isSystemAdmin)) {
                  return (
                    <StewardshipActions
                      spotId={spotId}
                      obs={obs}
                      currentStewardId={currentStewardId}
                    >
                      {speciesButton}
                    </StewardshipActions>
                  );
                }
                return speciesButton ? <div className="mt-2">{speciesButton}</div> : null;
              })()}
              {(() => {
                const obsPhotos = photosForObservation(obs);
                if (obsPhotos.length === 0) return null;
                const canEditPhotos = canEditObservation(obs, currentUserId, isSystemAdmin);
                return (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {obsPhotos.map(({ photoId, url, thumbUrl, portrait }) => (
                      <PhotoThumbnail
                        key={photoId ?? url}
                        photoId={photoId}
                        url={url}
                        thumbUrl={thumbUrl}
                        linkPath={photoId ? photoPath(spotSlug, obs.observationId, photoId) : null}
                        highlighted={!!photoId && photoId === highlightPhotoId}
                        canEditPortrait={canEditPhotos && portrait}
                        canMove={canEditPhotos}
                        observedAt={obs.observedAt}
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
          spotFocus={spotFocus}
          spotWeedLevel={spotWeedLevel}
          observerName={observerName}
          currentStewardId={currentStewardId}
          onClose={() => setDialogOpen(false)}
        />
      )}

      {speciesObservation && (
        <SpeciesSheet
          observation={speciesObservation}
          canReview={canIdentifySpecies(speciesObservation, currentUserId, isSystemAdmin)}
          onClose={() => setSpeciesObservation(null)}
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
