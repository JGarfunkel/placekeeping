"use client";

import { APIProvider, useMapsLibrary } from "@vis.gl/react-google-maps";
import { useRouter } from "next/navigation";
import { useState } from "react";

type MissingGeoFields = {
  address: boolean;
  state: boolean;
  postalCity: boolean;
  municipality: boolean;
  county: boolean;
};

// Same reverse-geocode source as SpotForm's "Fill from coordinates" button,
// but triggered from the read-only detail page and only filling fields the
// spot doesn't already have -- never overwrites a value someone entered by
// hand.
export function FillGeoDetailsButton({
  spotId,
  latitude,
  longitude,
  missing,
}: {
  spotId: number;
  latitude: number;
  longitude: number;
  missing: MissingGeoFields;
}) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;

  return (
    <APIProvider apiKey={apiKey}>
      <FillGeoDetailsButtonInner
        spotId={spotId}
        latitude={latitude}
        longitude={longitude}
        missing={missing}
      />
    </APIProvider>
  );
}

function FillGeoDetailsButtonInner({
  spotId,
  latitude,
  longitude,
  missing,
}: {
  spotId: number;
  latitude: number;
  longitude: number;
  missing: MissingGeoFields;
}) {
  const router = useRouter();
  const geocodingLib = useMapsLibrary("geocoding");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (!geocodingLib) return;
    setError(null);
    setPending(true);
    try {
      const response = await new geocodingLib.Geocoder().geocode({
        location: { lat: latitude, lng: longitude },
      });
      const components = response.results[0]?.address_components ?? [];
      const stateComponent = components.find((c) =>
        c.types.includes("administrative_area_level_1"),
      );
      const postalCityComponent = components.find(
        (c) => c.types.includes("locality") || c.types.includes("sublocality"),
      );
      const municipalityComponent =
        components.find((c) => c.types.includes("administrative_area_level_3")) ??
        postalCityComponent;
      const countyComponent = components.find((c) =>
        c.types.includes("administrative_area_level_2"),
      );

      const payload: {
        address?: string;
        state?: string;
        postalCity?: string;
        municipality?: string;
        county?: string;
        useMunicipalityForSlug?: boolean;
      } = {};
      if (missing.address && response.results[0]?.formatted_address) {
        payload.address = response.results[0].formatted_address;
      }
      if (missing.state && stateComponent) payload.state = stateComponent.short_name;
      if (missing.postalCity && postalCityComponent) {
        payload.postalCity = postalCityComponent.long_name;
      } else if (missing.postalCity && (!missing.municipality || municipalityComponent)) {
        // Some points (rural/unincorporated areas) have no finer-grained
        // locality/sublocality for Google to return as postalCity -- fall
        // back to slugging off municipality instead, so the spot still gets
        // a permalink rather than staying stuck at /spots/<id> forever. Only
        // safe once we know a municipality actually exists here: either the
        // spot already has one (!missing.municipality) or this same geocode
        // call is about to supply one.
        payload.useMunicipalityForSlug = true;
      }
      if (missing.municipality && municipalityComponent) {
        payload.municipality = municipalityComponent.long_name;
      }
      if (missing.county && countyComponent) payload.county = countyComponent.long_name;

      if (Object.keys(payload).length === 0) {
        throw new Error("Couldn't determine location details for these coordinates");
      }

      const res = await fetch(`/api/spots/${spotId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          body?.error ? JSON.stringify(body.error) : "Failed to save location details",
        );
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setPending(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending || !geocodingLib}
        className="text-xs font-medium text-blue-600 underline disabled:opacity-50"
      >
        {pending ? "Looking up…" : "Fill in missing location details"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
