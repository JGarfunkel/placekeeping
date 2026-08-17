"use client";

import type { Subdivision } from "@placekeeping/core";
import type { SpotSummary } from "@placekeeping/shared-types";
import Link from "next/link";
import { useState } from "react";
import { resolvePin } from "@/lib/pins/resolvePin";
import { DEFAULT_PIN_SVG, renderPin } from "@/lib/pins/renderPin";

// categoryKey (packages/core/src/territory.ts) is "stewarded"/"unstewarded"
// plus purpose, e.g. "stewarded-wild_area" -> { status: "stewarded", purpose: "wild_area" }.
function parseCategory(key: string): { status: string; purpose: string } {
  const [status, purpose] = key.split("-");
  return { status, purpose };
}

function formatCategory(key: string): string {
  const { status, purpose } = parseCategory(key);
  const label = purpose === "none" ? "unspecified purpose" : purpose.replace(/_/g, " ");
  return `${status === "stewarded" ? "Stewarded" : "Unstewarded"} ${label}`;
}

// The scoreboard only knows purpose, not vegetation. Monument's glyph never
// depends on vegetation, and garden's falls back to its own glyph when
// vegetation is "none" (see resolvePin.ts), so passing vegetation: "none"
// here still gets each its real pin. wild_area/none has no such fallback and
// gets the same default marker the map itself uses when there's no
// vegetation-derived glyph to draw.
function categoryIcon(key: string): string {
  const { status, purpose } = parseCategory(key);
  if (purpose !== "garden" && purpose !== "monument") return DEFAULT_PIN_SVG;
  return renderPin(
    resolvePin({
      purpose: purpose as "garden" | "monument",
      vegetation: "none",
      weedLevel: "minimal",
      stewardId: status === "stewarded" ? "steward" : null,
      stewardIsOwner: false,
    }),
  );
}

type View = "scoreboard" | "list";

// The territory page's right-hand column: a toggle between the scoreboard
// (subdivisions ranked by count, or -- at the finest grain, a city/town/
// village with nothing further to drill into -- this territory's own
// category breakdown) and a plain list of the spots themselves.
export function TerritorySidePanel({
  territoryName,
  subdivisions,
  scoreboard,
  spots,
}: {
  territoryName: string;
  subdivisions: Subdivision[];
  scoreboard: { category: string; count: number }[];
  spots: SpotSummary[];
}) {
  const [view, setView] = useState<View>("scoreboard");

  return (
    <div className="flex flex-col gap-4 lg:pl-6">
      <div className="flex gap-2 text-sm">
        {(["scoreboard", "list"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setView(option)}
            className={`rounded-md px-3 py-1 capitalize ${
              view === option
                ? "bg-neutral-900 text-white"
                : "bg-neutral-100 text-neutral-700"
            }`}
          >
            {option}
          </button>
        ))}
      </div>

      {view === "scoreboard" &&
        (subdivisions.length > 0 ? (
          <>
            <h2 className="text-lg font-medium">In {territoryName}</h2>
            <ul className="divide-y divide-neutral-200">
              {subdivisions.map((subdivision) => (
                <li
                  key={subdivision.path}
                  className="flex items-baseline justify-between py-3"
                >
                  <Link
                    href={`/spots/${subdivision.path}`}
                    className="font-medium underline"
                  >
                    {subdivision.name}
                  </Link>
                  <span className="text-sm text-neutral-500">{subdivision.totalCount}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <h2 className="text-lg font-medium">{territoryName} scoreboard</h2>
            <ul className="divide-y divide-neutral-200">
              {scoreboard.map(({ category, count }) => (
                <li key={category} className="flex items-center justify-between py-3">
                  <span className="flex items-center gap-2">
                    <span
                      className="h-6 w-4 shrink-0"
                      aria-hidden="true"
                      dangerouslySetInnerHTML={{ __html: categoryIcon(category) }}
                    />
                    {formatCategory(category)}
                  </span>
                  <span className="text-sm text-neutral-500">{count}</span>
                </li>
              ))}
              {scoreboard.length === 0 && (
                <li className="py-6 text-sm text-neutral-500">
                  No spots found in {territoryName} yet.
                </li>
              )}
            </ul>
          </>
        ))}

      {view === "list" && (
        <>
          <h2 className="text-lg font-medium">Spots</h2>
          <ul className="divide-y divide-neutral-200">
            {spots.map((spot) => (
              <li key={spot.spotId} className="py-3">
                <Link href={`/spots/${spot.spotId}`} className="font-medium underline">
                  {spot.name}
                </Link>
              </li>
            ))}
            {spots.length === 0 && (
              <li className="py-6 text-sm text-neutral-500">
                No spots found in {territoryName} yet.
              </li>
            )}
          </ul>
        </>
      )}
    </div>
  );
}
