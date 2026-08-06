import {
  canManageSite,
  canManageSpot,
  getSpotById,
  getStewardByStewardId,
  listObservationsForSpot,
  resolveState,
} from "@placekeeping/core";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { SpotForm } from "@/components/forms/SpotForm";
import { SiteColumn } from "@/components/spots/SiteColumn";
import { SpotColumns } from "@/components/spots/SpotColumns";
import { TerritoryView } from "@/components/spots/TerritoryView";
import { getSiteColumnData } from "@/lib/siteColumnData";
import { requireAuthContext } from "@/lib/session";
import { classifySpotPath } from "@/lib/spotRoute";
import { buildTerritoryMetadata } from "@/lib/territoryMetadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ a: string; b: string }>;
}): Promise<Metadata> {
  const { a, b } = await params;
  const route = classifySpotPath([a, b]);
  if (route.kind !== "state") return {};
  const resolution = await resolveState(route.cc, route.sc);
  return resolution ? buildTerritoryMetadata(resolution) : {};
}

export default async function SpotsDepth2Page({
  params,
}: {
  params: Promise<{ a: string; b: string }>;
}) {
  const { a, b } = await params;
  const route = classifySpotPath([a, b]);

  if (route.kind === "spotEdit") {
    const authContext = await requireAuthContext();
    const spot = await getSpotById(route.id);
    if (!spot) {
      console.warn("[spots] 404: no spot with id for edit", route.id);
      notFound();
    }
    if (!canManageSpot(authContext, spot)) {
      redirect(`/spots/${route.id}`);
    }

    // The spot's currently assigned steward (which may be a group the
    // editor administers, not their own individual steward) -- seeds the
    // picker so saving without touching it doesn't silently clear it.
    const currentSteward = await getStewardByStewardId(spot.stewardId);
    const observations = await listObservationsForSpot(route.id);
    const { linkedSite, parcelGeometries, memberSpots } =
      await getSiteColumnData(spot);
    const canEditSite = !!linkedSite && canManageSite(authContext, linkedSite);

    const seenPhotoUrls = new Set<string>();
    const observationPhotos = observations
      .flatMap((obs) =>
        obs.photoUrls.map((url) => ({ url, observedAt: obs.observedAt })),
      )
      .filter(({ url }) => {
        if (seenPhotoUrls.has(url)) return false;
        seenPhotoUrls.add(url);
        return true;
      });

    return (
      <SpotColumns
        site={
          <SiteColumn
            spot={spot}
            linkedSite={linkedSite}
            parcelGeometries={parcelGeometries}
            memberSpots={memberSpots}
            canManageParcel
            canEditSite={canEditSite}
          />
        }
        main={
          <>
            <h1 className="text-2xl font-semibold">Edit spot</h1>
            <SpotForm
              existing={spot}
              observationPhotos={observationPhotos}
              currentSteward={
                currentSteward
                  ? { stewardId: currentSteward.stewardId, name: currentSteward.name }
                  : null
              }
            />
          </>
        }
      />
    );
  }

  if (route.kind === "state") {
    const resolution = await resolveState(route.cc, route.sc);
    if (!resolution) {
      console.warn("[spots] 404: state did not resolve", { cc: route.cc, sc: route.sc });
      notFound();
    }
    return <TerritoryView resolution={resolution} />;
  }

  console.warn("[spots] 404: path did not classify", { a, b, route });
  notFound();
}
