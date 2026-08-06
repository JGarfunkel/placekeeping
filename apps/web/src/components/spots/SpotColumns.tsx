import type { ReactNode } from "react";

// Site > Spot > Observations, 3 columns on desktop with subtle vertical
// dividers, stacked on mobile. `observations` is optional -- the edit page
// drops it to give the form more room while keeping the Site column
// visible for context. Also reused by the standalone /sites/[siteId] page
// (main-only, no observations) so its SiteMapAndParcels column lines up in
// the same left-column slot as the Spot page's Site column.
export function SpotColumns({
  site,
  main,
  observations,
}: {
  site: ReactNode;
  main: ReactNode;
  observations?: ReactNode;
}) {
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
