"use client";

import type { Spot, Vegetation, WeedLevel } from "@placekeeping/shared-types";
import { APIProvider, useMapsLibrary } from "@vis.gl/react-google-maps";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  type EditState,
  type Field,
  onVegetationChange,
  onWeedLevelChange,
  overtakenPrompt,
  weedLevelWarning,
} from "@/taxonomy/vegetationWeedSync";
import { FormSection } from "./FormSection";
import {
  placeAccessOptions,
  spotPurposeOptions,
  vegetationOptions,
  weedLevelOptions,
} from "./spotOptions";
import { StewardshipFields } from "./StewardshipFields";

type StewardRef = { stewardId: string; name: string };

export function SpotForm({
  existing,
  observationPhotos = [],
  currentSteward = null,
  initialCoverPhotoUrl,
}: {
  existing?: Spot;
  observationPhotos?: { url: string; observedAt: string }[];
  currentSteward?: StewardRef | null;
  initialCoverPhotoUrl?: string;
}) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  const form = (
    <SpotFormFields
      existing={existing}
      observationPhotos={observationPhotos}
      currentSteward={currentSteward}
      initialCoverPhotoUrl={initialCoverPhotoUrl}
    />
  );
  return apiKey ? <APIProvider apiKey={apiKey}>{form}</APIProvider> : form;
}

function SpotFormFields({
  existing,
  observationPhotos,
  currentSteward,
  initialCoverPhotoUrl,
}: {
  existing?: Spot;
  observationPhotos: { url: string; observedAt: string }[];
  currentSteward: StewardRef | null;
  initialCoverPhotoUrl?: string;
}) {
  const router = useRouter();
  const geocodingLib = useMapsLibrary("geocoding");
  const [name, setName] = useState(existing?.name ?? "");
  const [latitude, setLatitude] = useState(
    existing ? String(existing.latitude) : "",
  );
  const [longitude, setLongitude] = useState(
    existing ? String(existing.longitude) : "",
  );
  const [address, setAddress] = useState(existing?.address ?? "");
  const [parcelId, setParcelId] = useState(existing?.parcelId ?? "");
  const [state, setState] = useState(existing?.state ?? "");
  const [municipality, setMunicipality] = useState(
    existing?.municipality ?? "",
  );
  const [postalCity, setPostalCity] = useState(existing?.postalCity ?? "");
  const [county, setCounty] = useState(existing?.county ?? "");
  const [useMunicipalityForSlug, setUseMunicipalityForSlug] = useState(
    existing?.useMunicipalityForSlug ?? false,
  );
  const [sizeSqft, setSizeSqft] = useState(
    existing?.sizeSqft != null ? String(existing.sizeSqft) : "",
  );
  const [addressVisibility, setAddressVisibility] = useState(
    existing?.addressVisibility ?? "public",
  );
  const [vegetation, setVegetation] = useState<Vegetation | "">(
    existing?.vegetation ?? "",
  );
  const [weedLevel, setWeedLevel] = useState<WeedLevel>(
    existing?.weedLevel ?? "minimal",
  );
  const [touched, setTouched] = useState<Set<Field>>(new Set());

  function applyEdit(edit: (s: EditState) => EditState) {
    const next = edit({ vegetation, weedLevel, touched: new Set(touched) });
    setVegetation(next.vegetation);
    setWeedLevel(next.weedLevel);
    setTouched(next.touched);
  }

  const editState: EditState = { vegetation, weedLevel, touched };
  const [educationalComponent, setEducationalComponent] = useState(
    existing?.educationalComponent ?? false,
  );
  const [educationalNotes, setEducationalNotes] = useState(
    existing?.educationalNotes ?? "",
  );
  const [selectedSteward, setSelectedSteward] = useState<StewardRef | null>(
    currentSteward,
  );
  const [purpose, setPurpose] = useState(existing?.purpose ?? "");
  const [access, setAccess] = useState(existing?.access ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [needs, setNeeds] = useState(existing?.needs ?? "");
  const [plans, setPlans] = useState(existing?.plans ?? "");
  const [website, setWebsite] = useState(existing?.website ?? "");
  const [photoAlbumUrl, setPhotoAlbumUrl] = useState(
    existing?.photoAlbumUrl ?? "",
  );
  const [inaturalistUrl, setInaturalistUrl] = useState(
    existing?.inaturalistUrl ?? "",
  );
  const [coverPhotoUrl, setCoverPhotoUrl] = useState(
    existing?.coverPhotoUrl ?? initialCoverPhotoUrl ?? "",
  );
  const [coverPhotoLoadError, setCoverPhotoLoadError] = useState(false);
  const [coverPhotoPickerOpen, setCoverPhotoPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [geocoding, setGeocoding] = useState(false);

  function selectCoverPhoto(url: string) {
    setCoverPhotoUrl(url);
    setCoverPhotoLoadError(false);
    setCoverPhotoPickerOpen(false);
  }

  async function lookUpFromCoordinates() {
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!geocodingLib || Number.isNaN(lat) || Number.isNaN(lng)) return;
    setGeocoding(true);
    try {
      const response = await new geocodingLib.Geocoder().geocode({
        location: { lat, lng },
      });
      const components = response.results[0]?.address_components ?? [];
      const stateComponent = components.find((c) =>
        c.types.includes("administrative_area_level_1"),
      );
      const postalCityComponent = components.find(
        (c) => c.types.includes("locality") || c.types.includes("sublocality"),
      );
      // administrative_area_level_3 is Google's best approximation of the
      // governing town/township in states that have them; falls back to the
      // postal city where that granularity doesn't exist (e.g. much of the
      // South/West, where the postal city and the jurisdiction coincide).
      const municipalityComponent =
        components.find((c) =>
          c.types.includes("administrative_area_level_3"),
        ) ?? postalCityComponent;
      const countyComponent = components.find((c) =>
        c.types.includes("administrative_area_level_2"),
      );
      if (stateComponent) setState(stateComponent.short_name);
      if (postalCityComponent) setPostalCity(postalCityComponent.long_name);
      if (municipalityComponent) setMunicipality(municipalityComponent.long_name);
      if (countyComponent) setCounty(countyComponent.long_name);
    } catch {
      // best-effort lookup; leave fields untouched on failure
    } finally {
      setGeocoding(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const payload = {
        name,
        latitude: Number(latitude),
        longitude: Number(longitude),
        address: address || undefined,
        parcelId: parcelId || undefined,
        state: state || undefined,
        municipality: municipality || undefined,
        postalCity: postalCity || undefined,
        county: county || undefined,
        addressVisibility,
        useMunicipalityForSlug,
        sizeSqft: sizeSqft ? Number(sizeSqft) : undefined,
        vegetation: vegetation || undefined,
        weedLevel,
        educationalComponent,
        educationalNotes: educationalNotes || undefined,
        stewardId: selectedSteward?.stewardId ?? null,
        purpose: purpose || undefined,
        access: access || undefined,
        description: description || undefined,
        needs: needs || undefined,
        plans: plans || undefined,
        website: website || undefined,
        coverPhotoUrl: coverPhotoUrl || undefined,
        photoAlbumUrl: photoAlbumUrl || undefined,
        inaturalistUrl: inaturalistUrl || undefined,
      };
      console.log("[SpotForm] saving, selectedSteward =", selectedSteward);

      const res = existing
        ? await fetch(`/api/spots/${existing.spotId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/spots", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          body?.error ? JSON.stringify(body.error) : "Failed to save spot",
        );
      }
      const { spot } = await res.json();
      router.push(`/spots/${spot.spotId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        Name
        <input
          required
          className="rounded-md border border-neutral-300 px-3 py-2"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Description
        <textarea
          className="rounded-md border border-neutral-300 px-3 py-2"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>

      <div className="flex flex-col gap-2 text-sm">
        Cover photo
        {coverPhotoUrl.trim() && !coverPhotoLoadError ? (
          <div className="relative h-40 w-full max-w-md">
            <img
              src={coverPhotoUrl.trim()}
              alt="Cover photo preview"
              className="h-40 w-full max-w-md rounded-md border border-neutral-200 object-cover"
              onError={() => setCoverPhotoLoadError(true)}
            />
            <button
              type="button"
              onClick={() => selectCoverPhoto("")}
              aria-label="Remove cover photo"
              className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-neutral-900 text-xs leading-none text-white hover:bg-neutral-700"
            >
              ✕
            </button>
          </div>
        ) : (
          <div className="flex h-40 w-full max-w-md items-center justify-center rounded-md border border-dashed border-neutral-300 text-xs text-neutral-500">
            {coverPhotoUrl.trim() && coverPhotoLoadError
              ? "Couldn't load this photo"
              : "No cover photo set"}
          </div>
        )}
        <button
          type="button"
          onClick={() => setCoverPhotoPickerOpen((open) => !open)}
          className="self-start text-sm font-medium text-neutral-600 underline hover:text-neutral-900"
        >
          {coverPhotoUrl.trim() ? "Change cover photo" : "Select cover photo"}
        </button>

        {coverPhotoPickerOpen && (
          <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3">
            {observationPhotos.length > 0 ? (
              <>
                <p className="mb-2 text-xs text-neutral-600">
                  Click a photo below to set it as the cover photo.
                </p>
                <div className="flex flex-wrap gap-2">
                  {observationPhotos.map((photo) => (
                    <button
                      key={photo.url}
                      type="button"
                      onClick={() => selectCoverPhoto(photo.url)}
                      className="rounded-md ring-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
                    >
                      <img
                        src={photo.url}
                        alt={`Observation photo from ${photo.observedAt}`}
                        className="h-20 w-20 rounded-md border border-neutral-200 object-cover hover:opacity-80"
                      />
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-xs text-neutral-600">
                No photos yet — add an observation with a photo, then come
                back here to select it as the cover photo.
              </p>
            )}
          </div>
        )}
      </div>

      <FormSection title="Location">
        <label className="flex flex-col gap-1 text-sm">
          Address / cross streets
          <input
            className="rounded-md border border-neutral-300 px-3 py-2"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Show address to
          <select
            className="rounded-md border border-neutral-300 px-3 py-2"
            value={addressVisibility}
            onChange={(e) =>
              setAddressVisibility(e.target.value as typeof addressVisibility)
            }
          >
            <option value="public">Everyone</option>
            <option value="municipality">Municipality only</option>
            <option value="hidden">Nobody</option>
          </select>
          <span className="text-xs text-neutral-500">
            For a residential spot you&apos;d rather not pinpoint publicly.
            Municipality/county are always shown separately — this only
            governs the street address text. There&apos;s no separate
            municipal-official account yet, so &quot;Municipality only&quot;
            currently behaves the same as &quot;Nobody&quot; for public
            viewers.
          </span>
        </label>

        <div className="flex gap-3">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            State
            <input
              className="rounded-md border border-neutral-300 px-3 py-2"
              value={state}
              onChange={(e) => setState(e.target.value)}
            />
          </label>
          <label className="flex flex-1 flex-col gap-1 text-sm">
            Postal city
            <input
              className="rounded-md border border-neutral-300 px-3 py-2"
              value={postalCity}
              onChange={(e) => setPostalCity(e.target.value)}
            />
            <span className="text-xs text-neutral-500">
              The mailing/ZIP city — may differ from the governing town.
            </span>
          </label>
          <label className="flex flex-1 flex-col gap-1 text-sm">
            Municipality
            <input
              className="rounded-md border border-neutral-300 px-3 py-2"
              value={municipality}
              onChange={(e) => setMunicipality(e.target.value)}
            />
            <span className="text-xs text-neutral-500">
              The governing town/city/village jurisdiction.
            </span>
          </label>
          <label className="flex flex-1 flex-col gap-1 text-sm">
            County
            <input
              className="rounded-md border border-neutral-300 px-3 py-2"
              value={county}
              onChange={(e) => setCounty(e.target.value)}
            />
          </label>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={useMunicipalityForSlug}
            onChange={(e) => setUseMunicipalityForSlug(e.target.checked)}
          />
          Use municipality (instead of postal city) in this spot&apos;s URL
        </label>

        <div className="flex gap-3">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            Latitude
            <input
              required
              type="number"
              step="any"
              className="rounded-md border border-neutral-300 px-3 py-2"
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
            />
          </label>
          <label className="flex flex-1 flex-col gap-1 text-sm">
            Longitude
            <input
              required
              type="number"
              step="any"
              className="rounded-md border border-neutral-300 px-3 py-2"
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
            />
          </label>
        </div>
        <p className="-mt-3 text-xs text-neutral-500">
          Tip: drop a pin in Google Maps, then copy the coordinates shown in
          the URL.
        </p>
        {geocodingLib && (
          <button
            type="button"
            onClick={lookUpFromCoordinates}
            disabled={geocoding || !latitude || !longitude}
            className="-mt-3 self-start text-xs font-medium text-blue-600 underline disabled:opacity-50"
          >
            {geocoding
              ? "Looking up…"
              : "Fill postal city / municipality / state from coordinates"}
          </button>
        )}

        <label className="flex flex-col gap-1 text-sm">
          Parcel ID
          <input
            className="rounded-md border border-neutral-300 px-3 py-2"
            value={parcelId}
            onChange={(e) => setParcelId(e.target.value)}
          />
        </label>
      </FormSection>

      <FormSection title="Details">
        <div className="flex gap-3">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            Purpose
            <select
              className="rounded-md border border-neutral-300 px-3 py-2"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value as typeof purpose)}
            >
              <option value="">Unspecified</option>
              {spotPurposeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-1 flex-col gap-1 text-sm">
            Access
            <select
              className="rounded-md border border-neutral-300 px-3 py-2"
              value={access}
              onChange={(e) => setAccess(e.target.value as typeof access)}
            >
              <option value="">Unspecified</option>
              {placeAccessOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="flex flex-col gap-1 text-sm">
          Size (sq ft)
          <input
            type="number"
            step="any"
            min="0"
            className="rounded-md border border-neutral-300 px-3 py-2"
            value={sizeSqft}
            onChange={(e) => setSizeSqft(e.target.value)}
          />
        </label>

        <div className="flex gap-3">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            Vegetation
            <select
              className="rounded-md border border-neutral-300 px-3 py-2"
              value={vegetation}
              onChange={(e) =>
                applyEdit((s) =>
                  onVegetationChange(s, e.target.value as Vegetation | ""),
                )
              }
            >
              <option value="">Unspecified</option>
              {vegetationOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-1 flex-col gap-1 text-sm">
            Weed level
            <select
              className="rounded-md border border-neutral-300 px-3 py-2"
              value={weedLevel}
              onChange={(e) =>
                applyEdit((s) => onWeedLevelChange(s, e.target.value as WeedLevel))
              }
            >
              {weedLevelOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {overtakenPrompt(editState) && (
          <div className="flex flex-col gap-1.5 text-xs text-amber-600">
            <p>{overtakenPrompt(editState)}</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() =>
                  applyEdit((s) => onVegetationChange(s, "herbaceous_weeds"))
                }
                className="rounded-md border border-amber-300 px-2 py-1 font-medium hover:bg-amber-50"
              >
                Herbaceous weeds
              </button>
              <button
                type="button"
                onClick={() =>
                  applyEdit((s) => onVegetationChange(s, "vigorous_weeds"))
                }
                className="rounded-md border border-amber-300 px-2 py-1 font-medium hover:bg-amber-50"
              >
                Vigorous weeds
              </button>
            </div>
          </div>
        )}
        {weedLevelWarning(editState) && (
          <p className="text-xs text-amber-600">{weedLevelWarning(editState)}</p>
        )}
      </FormSection>

      <FormSection title="Stewardship">
        {!existing?.stewardId && existing?.stewardName && (
          <p className="text-xs text-neutral-500">
            Unlinked legacy name from import: &quot;{existing.stewardName}
            &quot;. Use the picker below to link it to a real steward record.
          </p>
        )}

        <StewardshipFields
          selectedSteward={selectedSteward}
          onSelectedStewardChange={setSelectedSteward}
          needs={needs}
          onNeedsChange={setNeeds}
          plans={plans}
          onPlansChange={setPlans}
          educationalComponent={educationalComponent}
          onEducationalComponentChange={setEducationalComponent}
          educationalNotes={educationalNotes}
          onEducationalNotesChange={setEducationalNotes}
        />
      </FormSection>

      <FormSection title="Connections" defaultOpen={false}>
        <label className="flex flex-col gap-1 text-sm">
          Website
          <input
            type="url"
            className="rounded-md border border-neutral-300 px-3 py-2"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Photo album URL
          <input
            type="url"
            className="rounded-md border border-neutral-300 px-3 py-2"
            value={photoAlbumUrl}
            onChange={(e) => setPhotoAlbumUrl(e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          iNaturalist URL
          <input
            type="url"
            className="rounded-md border border-neutral-300 px-3 py-2"
            value={inaturalistUrl}
            onChange={(e) => setInaturalistUrl(e.target.value)}
          />
        </label>
      </FormSection>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-neutral-900 px-4 py-2 font-medium text-white disabled:opacity-50"
      >
        {pending ? "Saving…" : existing ? "Save changes" : "Add spot"}
      </button>
    </form>
  );
}

