import type { ReactNode } from "react";

// Site > Spot > Observations, 3 columns on desktop with subtle vertical
// dividers, stacked on mobile. `observations` is optional -- the edit page
// drops it to give the form more room while keeping the Site column
// visible for context. Also reused by the standalone /sites/[siteId] page
// (main-only, no observations) so its SiteMapAndParcels column lines up in
// the same left-column slot as the Spot page's Site column.
//
// `forceVertical` is set when landing on an observation/photo permalink
// (see SpotDetailView's highlightObservationId/highlightPhotoId): the
// 3-column grid drops to a single stacked column at every width, and
// site/main collapse into a <details> so the linked observation is what's
// immediately visible instead of being pushed below the fold.
export function SpotColumns({
  site,
  main,
  observations,
  forceVertical = false,
  spotName,
  siteName,
}: {
  site: ReactNode;
  main: ReactNode;
  observations?: ReactNode;
  forceVertical?: boolean;
  // Named in each accordion's own summary when forceVertical -- siteName is
  // null when this spot has no linked site yet (SiteColumn still renders
  // something useful there: its own pin, or the owner-only discovery flow).
  spotName?: string;
  siteName?: string | null;
}) {
  if (forceVertical) {
    // 90% of the viewport (capped so it doesn't get silly on an ultrawide
    // monitor) -- wide enough for the featured photo to actually read as
    // "big", per the permalink spec in user-stories.md.
    return (
      <main className="mx-auto flex w-[90vw] max-w-4xl flex-col gap-6 px-6 py-8">
        <details className="rounded-md border border-neutral-200">
          <summary className="cursor-pointer select-none p-3 text-sm font-medium text-neutral-600">
            {siteName ? `Site: ${siteName}` : "Site"}
          </summary>
          <div className="border-t border-neutral-200 p-4">{site}</div>
        </details>
        <details className="rounded-md border border-neutral-200">
          <summary className="cursor-pointer select-none p-3 text-sm font-medium text-neutral-600">
            Spot: {spotName}
          </summary>
          <div className="border-t border-neutral-200 p-4">{main}</div>
        </details>
        {observations && <div className="flex flex-col gap-6">{observations}</div>}
      </main>
    );
  }

  return (
    <main
      className="mx-auto flex max-w-7xl flex-col gap-8 px-6 py-8 lg:grid lg:items-start lg:gap-0 lg:divide-x lg:divide-neutral-200"
      style={{
        gridTemplateColumns: observations
          ? "360px minmax(0, 1fr) minmax(0, 1fr)"
          : "360px minmax(0, 1fr)",
      }}
    >
      <div className="flex flex-col gap-6 lg:pr-6">{site}</div>
      <div className="flex flex-col gap-6 lg:px-6">{main}</div>
      {observations && (
        <div className="flex flex-col gap-6 lg:pl-6">{observations}</div>
      )}
    </main>
  );
}
