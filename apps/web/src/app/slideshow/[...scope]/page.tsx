import {
  debugLog,
  getSlideshowTitle,
  listSlides,
  parseSlideshowScope,
  slideshowScopeKey,
} from "@placekeeping/core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ObservationSlideshow } from "@/components/slideshow/ObservationSlideshow";
import { makeShuffleSeed } from "@/lib/slideshow/seed";
import { parseSlideshowOptions } from "@/lib/slideshow/options";

type Props = {
  params: Promise<{ scope: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const scope = parseSlideshowScope((await params).scope);
  const title = scope ? await getSlideshowTitle(scope) : null;
  return { title: title ? `${title} slideshow` : "Slideshow" };
}

export default async function SlideshowPage({ params, searchParams }: Props) {
  const scope = parseSlideshowScope((await params).scope);
  if (!scope) notFound();

  const options = parseSlideshowOptions(await searchParams);
  // Fixed per page load so every page of a random shuffle shares one order.
  const seed = makeShuffleSeed();
  const [title, firstPage] = await Promise.all([
    getSlideshowTitle(scope),
    listSlides(scope, { order: options.order, seed }),
  ]);
  if (scope.kind === "spot" && title === null) notFound();

  debugLog(`starting slideshow with ${firstPage.total} photos`, slideshowScopeKey(scope));

  const backHref = scope.kind === "spot" ? `/spots/${scope.spotId}` : `/spots/${scope.path}`;

  return (
    <ObservationSlideshow
      scopeKey={slideshowScopeKey(scope)}
      title={title ?? "Slideshow"}
      backHref={backHref}
      initialOptions={options}
      initialPage={firstPage}
      seed={seed}
    />
  );
}
