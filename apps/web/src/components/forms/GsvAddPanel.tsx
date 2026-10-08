"use client";

import type { GsvCandidate } from "@placekeeping/shared-types";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { retargetImageUrl } from "@/lib/gsvUrl";

type Row = GsvCandidate & { selected: boolean; adjusting: boolean };

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatCaptureMonth(captureDate: string): string {
  const [year, month] = captureDate.split("-");
  const name = MONTH_NAMES[Number(month) - 1];
  return name ? `${name} ${year}` : captureDate;
}

async function errorMessage(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null);
  return typeof body?.error === "string" ? body.error : fallback;
}

function ViewSlider({
  label,
  min,
  max,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-neutral-600">
      <span className="w-14">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1"
      />
      <span className="w-8 text-right tabular-nums">{value}</span>
    </label>
  );
}

// "Add earlier Street View photos" -- paste a Street View link, tick the
// captures to attach. See local/gsv-historical-observations-plan.md.
export function GsvAddPanel({ spotId }: { spotId: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [historyFound, setHistoryFound] = useState(true);

  async function find() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/spots/${spotId}/gsv/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) throw new Error(await errorMessage(res, "Couldn't look that up"));
      const data: { candidates: GsvCandidate[]; historyFound: boolean } =
        await res.json();
      setHistoryFound(data.historyFound);
      setRows(
        data.candidates.map((c) => ({
          ...c,
          selected: c.alreadyAdded,
          adjusting: false,
        })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function patch(panoId: string, change: Partial<Row>) {
    setRows((prev) =>
      prev?.map((r) => (r.panoId === panoId ? { ...r, ...change } : r)) ?? null,
    );
  }

  function setView(row: Row, view: Partial<Pick<Row, "heading" | "pitch" | "fov">>) {
    const next = { heading: row.heading, pitch: row.pitch, fov: row.fov, ...view };
    patch(row.panoId, { ...next, imageUrl: retargetImageUrl(row.imageUrl, next) });
  }

  const chosen = rows?.filter((r) => r.selected && !r.alreadyAdded) ?? [];

  async function commit() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/spots/${spotId}/gsv/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: chosen.map(({ panoId, heading, pitch, fov }) => ({
            panoId,
            heading,
            pitch,
            fov,
          })),
        }),
      });
      if (!res.ok) throw new Error(await errorMessage(res, "Couldn't add those photos"));
      setOpen(false);
      setRows(null);
      setUrl("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-md border border-dashed border-neutral-300 p-3 text-left text-sm font-medium text-neutral-600 hover:border-neutral-400 hover:text-neutral-900"
      >
        + Add earlier Street View photos
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-neutral-200 p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Add earlier Street View photos</h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close"
          className="text-neutral-400 hover:text-neutral-900"
        >
          ✕
        </button>
      </div>

      <div className="flex gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={loading}
          placeholder="Paste a Street View link"
          className="min-w-0 flex-1 rounded-md border border-neutral-300 px-2 py-1 text-sm"
        />
        <button
          type="button"
          onClick={find}
          disabled={loading || !url.trim()}
          className="rounded-md border border-neutral-300 px-3 py-1 text-sm font-medium disabled:opacity-50"
        >
          {loading && !rows ? "Finding…" : "Find"}
        </button>
      </div>
      <p className="text-xs text-neutral-500">
        In Google Maps, open Street View at this spot, tap Share, then Copy link.
      </p>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {rows && !historyFound && (
        <p className="text-xs text-neutral-600">
          Only one capture was found at this location. Earlier dates may exist in
          Street View but could not be listed.
        </p>
      )}

      {rows && (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <li key={row.panoId} className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={row.selected}
                  disabled={row.alreadyAdded || loading}
                  onChange={(e) => patch(row.panoId, { selected: e.target.checked })}
                />
                {formatCaptureMonth(row.captureDate)}
                {row.alreadyAdded && (
                  <span className="text-xs font-normal text-neutral-500">
                    Already added
                  </span>
                )}
              </label>
              <img
                src={row.imageUrl}
                alt={`Street View, ${formatCaptureMonth(row.captureDate)}`}
                className="w-full rounded-md border border-neutral-200"
              />
              {!row.alreadyAdded && (
                <>
                  <button
                    type="button"
                    onClick={() => patch(row.panoId, { adjusting: !row.adjusting })}
                    className="self-start text-xs text-neutral-600 underline"
                  >
                    {row.adjusting ? "Hide view controls" : "Adjust view"}
                  </button>
                  {row.adjusting && (
                    <div className="flex flex-col gap-1">
                      <ViewSlider
                        label="Heading"
                        min={0}
                        max={360}
                        value={row.heading}
                        onChange={(n) => setView(row, { heading: n })}
                      />
                      <ViewSlider
                        label="Pitch"
                        min={-90}
                        max={90}
                        value={row.pitch}
                        onChange={(n) => setView(row, { pitch: n })}
                      />
                      <ViewSlider
                        label="Zoom (fov)"
                        min={10}
                        max={100}
                        value={row.fov}
                        onChange={(n) => setView(row, { fov: n })}
                      />
                    </div>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {rows && (
        <button
          type="button"
          onClick={commit}
          disabled={loading || chosen.length === 0}
          className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? "Adding…" : `Add ${chosen.length} selected`}
        </button>
      )}
    </div>
  );
}
