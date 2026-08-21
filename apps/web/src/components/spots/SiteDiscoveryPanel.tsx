"use client";

import {
  describePropertyClass,
  type ParcelCandidate,
  type ParcelLookupResult,
  type ParcelOwnerInfo,
  type Site,
  type SiteCandidate,
  type Spot,
} from "@placekeeping/shared-types";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MapView } from "@/components/map/MapView";
import {
  ParcelPicker,
  parcelPolygonsForCandidates,
  type ParcelSelection,
} from "./ParcelPicker";

type SiteCandidatesResult =
  | { status: "direct"; site: SiteCandidate["site"] }
  | { status: "candidates"; candidates: SiteCandidate[] }
  | { status: "none" };

const buttonClass =
  "self-start rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50";

// Parcel resolution, owner reveal, and site join for a spot with no site
// yet (local/spot-resolution.md). Owner-only: SiteColumn renders this
// behind isOwner, and only while spot.siteId is unset -- once a site is
// linked, SiteColumn switches to the read-only SiteMapAndParcels view.
export function SiteDiscoveryPanel({ spot }: { spot: Spot }) {
  const router = useRouter();

  const [parcelResult, setParcelResult] = useState<ParcelLookupResult | null>(
    null,
  );
  // Derived rather than a separate setState-at-effect-start flag (that
  // pattern trips react-hooks/set-state-in-effect): null means "still
  // loading" for both of these until the fetch resolves.
  const loadingParcel = parcelResult === null;
  const [findingParcel, setFindingParcel] = useState(false);
  const [parcelError, setParcelError] = useState<string | null>(null);
  // Populated when a Discover-parcel call surfaces multiple nearby
  // candidates (local/spot-resolution.md §4) -- non-null switches the panel
  // over to <ParcelPicker> instead of the plain "Discover parcel" button.
  const [candidates, setCandidates] = useState<ParcelCandidate[] | null>(
    null,
  );
  // Drives highlighting on the map above (see parcelPolygonsForCandidates)
  // -- nothing is highlighted until the user actually picks a radio.
  const [selectedCandidate, setSelectedCandidate] = useState<ParcelSelection>(
    "",
  );

  const [ownerInfo, setOwnerInfo] = useState<ParcelOwnerInfo | null>(null);
  const [loadingOwner, setLoadingOwner] = useState(false);
  const [ownerError, setOwnerError] = useState<string | null>(null);
  const alreadyRevealed =
    parcelResult?.status === "resolved" &&
    parcelResult.parcel.ownerRevealedAt !== null;

  const [siteCandidates, setSiteCandidates] =
    useState<SiteCandidatesResult | null>(null);
  const loadingCandidates =
    siteCandidates === null && parcelResult?.status === "resolved";

  const [selectedSiteId, setSelectedSiteId] = useState<number | "new" | "">(
    "",
  );
  // A site picked via the "search nearby sites" fallback rather than an
  // auto-detected direct hit / touching-parcel candidate (findCandidateSites'
  // ~11m buffer can miss a site that's merely nearby, e.g. across a street --
  // findNearbySites' quarter-mile radius, same as ReassignParcelControl,
  // backs the fallback search). Kept separate so it can render as its own
  // radio row without needing to be threaded into `siteCandidates`.
  const [manualSite, setManualSite] = useState<{
    siteId: number;
    name: string;
  } | null>(null);
  const [newSiteName, setNewSiteName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Cache-only read on mount -- never hits ArcGIS. Renders the panel with
  // no button at all when local containment already resolved this spot's
  // parcel at create time.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/spots/${spot.spotId}/parcel/lookup`)
      .then((res) => res.json())
      .then((body) => {
        if (!cancelled) setParcelResult(body.result);
      })
      .catch(() => {
        if (!cancelled) setParcelResult({ status: "unresolved" });
      });
    return () => {
      cancelled = true;
    };
  }, [spot.spotId]);

  // Once a parcel is resolved, load direct-hit/candidate options for the
  // join sub-panel.
  useEffect(() => {
    if (!parcelResult || parcelResult.status !== "resolved") return;
    let cancelled = false;
    fetch(`/api/spots/${spot.spotId}/site-candidates`)
      .then((res) => res.json())
      .then((body) => {
        if (!cancelled) setSiteCandidates(body.result);
      });
    return () => {
      cancelled = true;
    };
  }, [parcelResult, spot.spotId]);

  // Owner was already revealed on a previous visit -- show it again
  // without re-requiring the button click. The class gate (and the 403 if
  // it somehow weren't allowlisted) still applies server-side.
  useEffect(() => {
    if (alreadyRevealed && !ownerInfo && !loadingOwner && !ownerError) {
      void showOwner();
    }
    // showOwner is intentionally omitted: it's a plain function recreated
    // every render, and the guards above already make this idempotent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alreadyRevealed, ownerInfo, loadingOwner, ownerError]);

  async function findParcel() {
    setFindingParcel(true);
    setParcelError(null);
    setCandidates(null);
    setSelectedCandidate("");
    try {
      const res = await fetch(`/api/spots/${spot.spotId}/parcel/lookup`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to look up a parcel here");
      const { result } = await res.json();
      if (result.status === "candidates") {
        setCandidates(result.candidates);
      } else {
        setParcelResult(result);
      }
    } catch (err) {
      setParcelError(
        err instanceof Error ? err.message : "Something went wrong",
      );
    } finally {
      setFindingParcel(false);
    }
  }

  function onCandidateConfirmed(result: ParcelLookupResult) {
    setCandidates(null);
    setSelectedCandidate("");
    setParcelResult(result);
  }

  async function showOwner() {
    setLoadingOwner(true);
    setOwnerError(null);
    try {
      const res = await fetch(`/api/spots/${spot.spotId}/parcel/owner`);
      if (!res.ok) throw new Error("Failed to fetch the owner of record");
      const { owner } = (await res.json()) as { owner: ParcelOwnerInfo };
      setOwnerInfo(owner);
      if (owner.suggestedSiteName && !newSiteName) {
        setNewSiteName(owner.suggestedSiteName);
      }
    } catch (err) {
      setOwnerError(
        err instanceof Error ? err.message : "Something went wrong",
      );
    } finally {
      setLoadingOwner(false);
    }
  }

  async function saveSiteLink() {
    if (selectedSiteId === "") return;
    setSaving(true);
    setSaveError(null);
    try {
      const body =
        selectedSiteId === "new"
          ? { newSite: { name: newSiteName, purpose: null } }
          : { siteId: selectedSiteId };
      const res = await fetch(`/api/spots/${spot.spotId}/site`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(
          errBody?.error
            ? JSON.stringify(errBody.error)
            : "Failed to save the site link",
        );
      }
      setSaved(true);
      router.refresh();
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Something went wrong",
      );
    } finally {
      setSaving(false);
    }
  }

  // The map renders unconditionally (below) even while parcelResult is
  // still loading, so it doesn't flicker away/back on mount -- only the
  // discovery/candidate UI beneath it depends on loadingParcel.
  const parcelPolygons = candidates
    ? parcelPolygonsForCandidates(candidates, selectedCandidate)
    : undefined;
  const propClassDescription =
    parcelResult?.status === "resolved"
      ? describePropertyClass(parcelResult.parcel.propClass)
      : null;

  return (
    <div className="flex flex-col gap-4">
      <MapView
        spots={[
          {
            spotId: spot.spotId,
            name: spot.name,
            latitude: spot.latitude,
            longitude: spot.longitude,
            slugState: spot.slugState,
            slugLocality: spot.slugLocality,
            slug: spot.slug,
            accessibility: spot.accessibility,
            vegetation: spot.vegetation,
            purpose: spot.purpose,
            weedLevel: spot.weedLevel,
            stewardId: spot.stewardId,
            stewardIsOwner: spot.stewardIsOwner,
            coverPhotoUrl: spot.coverPhotoUrl,
          },
        ]}
        center={{ lat: spot.latitude, lng: spot.longitude }}
        compact
        movableSpotId={spot.spotId}
        parcelPolygons={parcelPolygons}
      />

      {loadingParcel && <p className="text-sm text-neutral-500">Loading…</p>}

      {candidates && (
        <ParcelPicker
          spotId={spot.spotId}
          candidates={candidates}
          selected={selectedCandidate}
          onSelectedChange={setSelectedCandidate}
          onConfirmed={onCandidateConfirmed}
          onCancel={() => {
            setCandidates(null);
            setSelectedCandidate("");
          }}
        />
      )}

      {!candidates && parcelResult?.status === "unresolved" && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-neutral-600">
            No parcel resolved for this spot yet.
          </p>
          <button
            type="button"
            onClick={findParcel}
            disabled={findingParcel}
            className={buttonClass}
          >
            {findingParcel ? "Looking up…" : "Discover parcel"}
          </button>
        </div>
      )}

      {!candidates && parcelResult?.status === "no_parcel" && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-neutral-600">
            Marked as having no parcel (e.g. this spot is in the street).
          </p>
          <button
            type="button"
            onClick={findParcel}
            disabled={findingParcel}
            className={buttonClass}
          >
            {findingParcel ? "Looking up…" : "Reconsider"}
          </button>
        </div>
      )}

      {!candidates && parcelResult?.status === "unparcelled" && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-neutral-600">
            No parcel data found here — this may be water, a right-of-way,
            or a county that hasn&apos;t published parcel data. This spot
            stands alone; you can try again later.
          </p>
          <button
            type="button"
            onClick={findParcel}
            disabled={findingParcel}
            className={buttonClass}
          >
            {findingParcel ? "Looking up…" : "Try again"}
          </button>
        </div>
      )}

      {parcelError && <p className="text-sm text-red-600">{parcelError}</p>}

      {!candidates && parcelResult?.status === "resolved" && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-neutral-500">Parcel</p>
            <button
              type="button"
              onClick={findParcel}
              disabled={findingParcel}
              className="text-xs font-medium text-neutral-600 underline hover:text-neutral-900 disabled:opacity-50"
            >
              {findingParcel ? "Looking up…" : "Change parcel"}
            </button>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <dt className="text-xs font-medium text-neutral-500">
              Print key
            </dt>
            <dd>{parcelResult.parcel.printKey ?? "—"}</dd>
            <dt className="text-xs font-medium text-neutral-500">Class</dt>
            <dd>
              {parcelResult.parcel.propClass ?? "—"}
              {propClassDescription && (
                <span className="text-neutral-500"> – {propClassDescription}</span>
              )}
            </dd>
            <dt className="text-xs font-medium text-neutral-500">
              County / municipality
            </dt>
            <dd>
              {[parcelResult.parcel.countyName, parcelResult.parcel.muniName]
                .filter(Boolean)
                .join(" / ") || "—"}
            </dd>
            <dt className="text-xs font-medium text-neutral-500">Acres</dt>
            <dd>{parcelResult.parcel.calcAcres ?? "—"}</dd>
            {parcelResult.parcel.nysName && (
              <>
                <dt className="text-xs font-medium text-neutral-500">
                  State agency
                </dt>
                <dd>{parcelResult.parcel.nysName}</dd>
              </>
            )}
          </dl>

          {parcelResult.isInstitutionalClass &&
            !ownerInfo &&
            !alreadyRevealed && (
              <button
                type="button"
                onClick={showOwner}
                disabled={loadingOwner}
                className={buttonClass}
              >
                {loadingOwner ? "Fetching…" : "Show owner"}
              </button>
            )}
          {alreadyRevealed && !ownerInfo && !ownerError && (
            <p className="text-sm text-neutral-500">Loading owner…</p>
          )}
          {ownerError && <p className="text-sm text-red-600">{ownerError}</p>}
          {ownerInfo && (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <dt className="text-xs font-medium text-neutral-500">Owner</dt>
              <dd>{ownerInfo.primaryOwner ?? "—"}</dd>
              {ownerInfo.addOwner && (
                <>
                  <dt className="text-xs font-medium text-neutral-500">
                    Additional owner
                  </dt>
                  <dd>{ownerInfo.addOwner}</dd>
                </>
              )}
            </dl>
          )}

          <SiteJoinPanel
            loading={loadingCandidates}
            candidates={siteCandidates}
            swisSblId={parcelResult.parcel.swisSblId}
            selectedSiteId={selectedSiteId}
            onSelect={setSelectedSiteId}
            manualSite={manualSite}
            onManualSitePicked={(site) => {
              setManualSite(site);
              setSelectedSiteId(site.siteId);
            }}
            newSiteName={newSiteName}
            onNewSiteNameChange={setNewSiteName}
            saving={saving}
            saved={saved}
            saveError={saveError}
            onSave={saveSiteLink}
          />
        </div>
      )}
    </div>
  );
}

function SiteJoinPanel({
  loading,
  candidates,
  swisSblId,
  selectedSiteId,
  onSelect,
  manualSite,
  onManualSitePicked,
  newSiteName,
  onNewSiteNameChange,
  saving,
  saved,
  saveError,
  onSave,
}: {
  loading: boolean;
  candidates: SiteCandidatesResult | null;
  swisSblId: string;
  selectedSiteId: number | "new" | "";
  onSelect: (value: number | "new" | "") => void;
  manualSite: { siteId: number; name: string } | null;
  onManualSitePicked: (site: { siteId: number; name: string }) => void;
  newSiteName: string;
  onNewSiteNameChange: (value: string) => void;
  saving: boolean;
  saved: boolean;
  saveError: string | null;
  onSave: () => void;
}) {
  if (saved) {
    return <p className="text-sm text-neutral-600">Site link saved.</p>;
  }

  if (loading || !candidates) {
    return <p className="text-sm text-neutral-500">Checking for a site…</p>;
  }

  const canSave =
    selectedSiteId !== "" &&
    (selectedSiteId !== "new" || newSiteName.trim().length > 0);

  return (
    <div className="flex flex-col gap-2 border-t border-neutral-200 pt-3">
      <p className="text-xs font-medium text-neutral-500">
        Site (draft — not saved yet)
      </p>

      {candidates.status === "direct" && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="site-choice"
            checked={selectedSiteId === candidates.site.siteId}
            onChange={() => onSelect(candidates.site.siteId)}
          />
          Join &quot;{candidates.site.name}&quot; (this parcel is already
          part of it)
        </label>
      )}

      {candidates.status === "candidates" &&
        candidates.candidates.map((c) => (
          <label key={c.site.siteId} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="site-choice"
              checked={selectedSiteId === c.site.siteId}
              onChange={() => onSelect(c.site.siteId)}
            />
            {c.site.name}
            {c.ownerMatch && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                owner match
              </span>
            )}
          </label>
        ))}

      {manualSite && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="site-choice"
            checked={selectedSiteId === manualSite.siteId}
            onChange={() => onSelect(manualSite.siteId)}
          />
          {manualSite.name}
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
            via search
          </span>
        </label>
      )}

      <NearbySitePicker swisSblId={swisSblId} onPick={onManualSitePicked} />

      <label className="flex items-center gap-2 text-sm">
        <input
          type="radio"
          name="site-choice"
          checked={selectedSiteId === "new"}
          onChange={() => onSelect("new")}
        />
        Create a new site
      </label>
      {selectedSiteId === "new" && (
        <input
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
          placeholder="Site name"
          value={newSiteName}
          onChange={(e) => onNewSiteNameChange(e.target.value)}
        />
      )}

      {saveError && <p className="text-sm text-red-600">{saveError}</p>}

      <button
        type="button"
        onClick={onSave}
        disabled={!canSave || saving}
        className="self-start rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save site & link"}
      </button>
    </div>
  );
}

// Fallback for when the site the user wants isn't a direct hit or a
// touching-parcel candidate (findCandidateSites' ~11m buffer) -- e.g. it's
// across a street. Searches the same quarter-mile radius as
// ReassignParcelControl's "move parcel" picker, lazily on open so it doesn't
// cost a request on every spot page load.
function NearbySitePicker({
  swisSblId,
  onPick,
}: {
  swisSblId: string;
  onPick: (site: { siteId: number; name: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [sites, setSites] = useState<Site[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || sites) return;
    let cancelled = false;
    fetch(`/api/sites?nearSwisSblId=${encodeURIComponent(swisSblId)}`)
      .then((res) => res.json())
      .then((body) => {
        if (!cancelled) setSites(body.sites);
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load nearby sites");
      });
    return () => {
      cancelled = true;
    };
  }, [open, sites, swisSblId]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start text-xs font-medium text-neutral-600 underline hover:text-neutral-900"
      >
        Not seeing the site you want? Search nearby sites
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {!sites && !error && (
        <p className="text-xs text-neutral-500">Loading nearby sites…</p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
      {sites && sites.length === 0 && (
        <p className="text-xs text-neutral-500">
          No other sites within a quarter mile.
        </p>
      )}
      {sites && sites.length > 0 && (
        <select
          className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
          defaultValue=""
          onChange={(e) => {
            const site = sites.find((s) => s.siteId === Number(e.target.value));
            if (site) onPick({ siteId: site.siteId, name: site.name });
          }}
        >
          <option value="" disabled>
            Choose a nearby site…
          </option>
          {sites.map((s) => (
            <option key={s.siteId} value={s.siteId}>
              {s.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
