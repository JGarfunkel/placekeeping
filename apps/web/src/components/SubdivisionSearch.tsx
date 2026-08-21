"use client";

import type { SubdivisionSearchResult } from "@placekeeping/core";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

// Formats as "name, state, country" per the label on this component's
// placement in page.tsx -- state/country are the display-only fields
// searchSubdivisions joins in, not part of the subdivision's own path.
function formatLabel(result: SubdivisionSearchResult): string {
  return [result.name, result.state, result.country].filter(Boolean).join(", ");
}

export function SubdivisionSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  // Off by default -- searches only what's already in our subdivisions
  // cache (fast, DB-only). Checked, every query goes to the live ArcGIS
  // fallback instead (see searchSubdivisionsLive in @placekeeping/core),
  // which is slower and, since it's not scoped to our own data, can surface
  // many more same-named places across every configured state.
  const [searchAll, setSearchAll] = useState(false);
  const [results, setResults] = useState<SubdivisionSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (!open || trimmed.length === 0) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      const qs = new URLSearchParams({ q: trimmed });
      if (searchAll) qs.set("live", "true");
      fetch(`/api/subdivisions/search?${qs.toString()}`)
        .then((res) => res.json())
        .then((body) => {
          if (!cancelled) setResults(body.subdivisions ?? []);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, open, searchAll]);

  function handleSelect(result: SubdivisionSearchResult) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("lat", String(result.centerLat));
    params.set("lng", String(result.centerLng));
    params.set("zoom", String(result.zoom));
    params.delete("radiusMi");
    setQuery(formatLabel(result));
    setOpen(false);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="relative flex w-full max-w-md items-center gap-3">
      <input
        type="text"
        className="flex-grow rounded-md border border-neutral-300 px-3 py-2 text-sm"
        placeholder="Search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />

      <label className="flex shrink-0 items-center gap-1.5 text-xs text-neutral-500"
        title="Search all places, not just those where we have spots recorded"
        >
        <input
          type="checkbox"
          checked={searchAll}
          onChange={(e) => setSearchAll(e.target.checked)}
        />
        All towns
      </label>

      {open && query.trim().length > 0 && (
        <div className="absolute left-0 top-full z-[1100] mt-1 w-full rounded-md border border-neutral-200 bg-white shadow-md">
          {loading ? (
            <p className="px-3 py-2 text-xs text-neutral-500">Searching…</p>
          ) : results.length > 0 ? (
            results.map((result) => (
              <button
                key={result.path}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(result)}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-neutral-50"
              >
                {formatLabel(result)}
              </button>
            ))
          ) : (
            <p className="px-3 py-2 text-xs text-neutral-500">
              No subdivisions found
            </p>
          )}
        </div>
      )}
    </div>
  );
}
