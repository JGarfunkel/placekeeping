import { getSpotById, getUserByUserId, resolveMunicipality } from "@placekeeping/core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ObservationForm } from "@/components/forms/ObservationForm";
import {
  MunicipalityAmbiguityView,
  TerritoryView,
} from "@/components/spots/TerritoryView";
import { requireAuthContext } from "@/lib/session";
import { classifySpotPath } from "@/lib/spotRoute";
import { buildTerritoryMetadata } from "@/lib/territoryMetadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ a: string; b: string; c: string }>;
}): Promise<Metadata> {
  const { a, b, c } = await params;
  const route = classifySpotPath([a, b, c]);
  if (route.kind !== "municipality") return {};
  const resolution = await resolveMunicipality(route.cc, route.sc, route.mc);
  return resolution && !("ambiguous" in resolution)
    ? buildTerritoryMetadata(resolution)
    : {};
}

export default async function SpotsDepth3Page({
  params,
}: {
  params: Promise<{ a: string; b: string; c: string }>;
}) {
  const { a, b, c } = await params;
  const route = classifySpotPath([a, b, c]);

  if (route.kind === "newObservation") {
    const authContext = await requireAuthContext();
    const [spot, observerUser] = await Promise.all([
      getSpotById(route.id),
      getUserByUserId(authContext.userId),
    ]);
    if (!spot) {
      console.warn("[spots] 404: no spot with id for new observation", route.id);
      notFound();
    }

    return (
      <main className="mx-auto flex max-w-2xl flex-col gap-4 px-6 py-8">
        <h1 className="text-2xl font-semibold">Add observation</h1>
        <p className="text-sm text-neutral-500">{spot.name}</p>
        <ObservationForm
          spotId={route.id}
          observerName={observerUser?.username ?? ""}
        />
      </main>
    );
  }

  if (route.kind === "municipality") {
    const resolution = await resolveMunicipality(route.cc, route.sc, route.mc);
    if (!resolution) {
      console.warn("[spots] 404: municipality did not resolve", {
        cc: route.cc,
        sc: route.sc,
        mc: route.mc,
      });
      notFound();
    }
    if ("ambiguous" in resolution) {
      return (
        <MunicipalityAmbiguityView
          cc={route.cc}
          sc={route.sc}
          mc={route.mc}
          ambiguity={resolution}
        />
      );
    }
    return <TerritoryView resolution={resolution} />;
  }

  console.warn("[spots] 404: path did not classify", { a, b, c, route });
  notFound();
}
