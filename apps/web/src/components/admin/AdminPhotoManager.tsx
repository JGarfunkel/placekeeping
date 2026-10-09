"use client";

import type { AdminPhotoRow } from "@placekeeping/shared-types";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  applyView,
  formatBytes,
  longEdge,
  matchFileToPhoto,
  NO_UPLOADER,
  parseViewState,
  serializeViewState,
  type Filters,
  type GroupKey,
  type SortKey,
  type ViewState,
} from "@/lib/adminPhotoView";

// --- API helpers ------------------------------------------------------------

async function postForPhoto(url: string, file?: File): Promise<AdminPhotoRow> {
  const body = file ? new FormData() : undefined;
  if (body && file) body.append("file", file);
  const res = await fetch(url, { method: "POST", body });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(typeof json?.error === "string" ? json.error : `Request failed (${res.status})`);
  }
  return json.photo as AdminPhotoRow;
}

const replaceUrl = (photoId: string) => `/api/admin/photos/${photoId}/replace`;
const regenerateUrl = (photoId: string) => `/api/admin/photos/${photoId}/regenerate`;

async function readImageSize(file: File): Promise<{ w: number; h: number } | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const size = { w: bitmap.width, h: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return null;
  }
}

function photoLabel(row: AdminPhotoRow): string {
  const name = row.originalFilename ?? row.storageKey?.slice(0, 8) ?? row.photoId.slice(0, 8);
  return `${row.spotName} · ${row.createdAt.slice(0, 10)} · ${name}`;
}

function dimensions(row: AdminPhotoRow): string {
  return row.originalW && row.originalH ? `${row.originalW}×${row.originalH}` : "—";
}

const SORTABLE: Array<{ key: SortKey; label: string }> = [
  { key: "spot", label: "Spot" },
  { key: "uploader", label: "Uploader" },
  { key: "created", label: "Created" },
  { key: "replaced", label: "Replaced" },
  { key: "filename", label: "Filename" },
  { key: "longEdge", label: "Dimensions" },
  { key: "bytes", label: "Size" },
];

const GROUPS: Array<{ key: GroupKey; label: string }> = [
  { key: "none", label: "No grouping" },
  { key: "observation", label: "Observation" },
  { key: "spot", label: "Spot" },
  { key: "uploader", label: "Uploader" },
  { key: "month", label: "Month" },
  { key: "source", label: "Source" },
  { key: "variantStatus", label: "Variant status" },
  { key: "moderation", label: "Moderation" },
];

const selectClass = "rounded border border-neutral-300 px-2 py-1 text-sm";
const buttonClass =
  "rounded border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:border-neutral-400 disabled:opacity-50";

// --- Detail panel -----------------------------------------------------------

function DetailPanel({
  row,
  onClose,
  onUpdated,
}: {
  row: AdminPhotoRow;
  onClose: () => void;
  onUpdated: (row: AdminPhotoRow) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [fileSize, setFileSize] = useState<{ w: number; h: number } | null>(null);
  const [busy, setBusy] = useState<"replace" | "regenerate" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  async function chooseFile(next: File | null) {
    setFile(next);
    setFileSize(next ? await readImageSize(next) : null);
    setError(null);
    setMessage(null);
  }

  async function run(kind: "replace" | "regenerate") {
    setBusy(kind);
    setError(null);
    setMessage(null);
    try {
      const updated =
        kind === "replace" && file
          ? await postForPhoto(replaceUrl(row.photoId), file)
          : await postForPhoto(regenerateUrl(row.photoId));
      onUpdated(updated);
      setMessage(kind === "replace" ? "Replaced." : "Variants regenerated.");
      if (kind === "replace") await chooseFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  const v = row.variants;
  return (
    <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col gap-4 overflow-y-auto border-l border-neutral-200 bg-white p-5 shadow-xl">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-lg font-semibold">{row.spotName}</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="text-2xl leading-none text-neutral-500 hover:text-neutral-900">
          ✕
        </button>
      </div>

      <img
        src={row.mediumUrl}
        alt={`Photo at ${row.spotName}`}
        className="max-h-72 w-full rounded-md border border-neutral-200 object-contain"
      />

      <div className="flex flex-wrap gap-3 text-sm">
        <a href={row.originalUrl} target="_blank" rel="noreferrer" className="underline">
          Open original
        </a>
        <Link href={`/spots/${row.spotId}`} className="underline">
          Spot page
        </Link>
      </div>

      <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-neutral-500">Source</dt>
        <dd>{row.source}</dd>
        <dt className="text-neutral-500">Variants</dt>
        <dd>{row.variantStatus}</dd>
        <dt className="text-neutral-500">Original</dt>
        <dd>
          {dimensions(row)} · {formatBytes(row.sizeBytes)}
        </dd>
        {v?.medium && (
          <>
            <dt className="text-neutral-500">Medium</dt>
            <dd>
              {v.medium.w}×{v.medium.h} · {formatBytes(v.medium.bytes)}
            </dd>
          </>
        )}
        {v?.thumb && (
          <>
            <dt className="text-neutral-500">Thumb</dt>
            <dd>
              {v.thumb.w}×{v.thumb.h} · {formatBytes(v.thumb.bytes)}
            </dd>
          </>
        )}
        <dt className="text-neutral-500">Filename</dt>
        <dd className="break-all">{row.originalFilename ?? "—"}</dd>
        <dt className="text-neutral-500">Uploader</dt>
        <dd>{row.uploaderName ?? "—"}</dd>
        <dt className="text-neutral-500">Created</dt>
        <dd>{new Date(row.createdAt).toLocaleString()}</dd>
        <dt className="text-neutral-500">Replaced</dt>
        <dd>{row.replacedAt ? new Date(row.replacedAt).toLocaleString() : "—"}</dd>
        <dt className="text-neutral-500">Moderation</dt>
        <dd>{row.moderationStatus}</dd>
        <dt className="text-neutral-500">Storage key</dt>
        <dd className="break-all font-mono text-xs">{row.storageKey ?? "—"}</dd>
      </dl>

      <section className="flex flex-col gap-2 border-t border-neutral-200 pt-4">
        <h3 className="font-medium">Replace file</h3>
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void chooseFile(e.dataTransfer.files[0] ?? null);
          }}
          className={`flex cursor-pointer flex-col items-center gap-1 rounded-md border border-dashed p-4 text-center text-sm ${
            dragging ? "border-neutral-900 bg-neutral-50" : "border-neutral-300"
          }`}
        >
          <span>Drop a full-resolution file here, or click to choose</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              void chooseFile(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
        </label>
        {file && (
          <p className="text-sm text-neutral-700">
            {file.name} · {fileSize ? `${fileSize.w}×${fileSize.h}` : "dimensions unknown"} · {formatBytes(file.size)}
            {row.source === "external" && " · this converts the external URL to an uploaded photo"}
          </p>
        )}
        <div className="flex gap-2">
          <button type="button" disabled={!file || busy !== null} onClick={() => run("replace")} className={buttonClass}>
            {busy === "replace" ? "Replacing…" : "Replace"}
          </button>
          {file && (
            <button type="button" disabled={busy !== null} onClick={() => chooseFile(null)} className={buttonClass}>
              Cancel
            </button>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-2 border-t border-neutral-200 pt-4">
        <h3 className="font-medium">Regenerate variants</h3>
        <p className="text-xs text-neutral-600">
          Rebuilds the medium and thumb copies from the stored original, without a new upload.
        </p>
        <div>
          <button
            type="button"
            disabled={row.source === "external" || busy !== null}
            onClick={() => run("regenerate")}
            className={buttonClass}
          >
            {busy === "regenerate" ? "Regenerating…" : "Regenerate"}
          </button>
        </div>
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {message && <p className="text-sm text-green-700">{message}</p>}
    </aside>
  );
}

// --- Bulk replace -----------------------------------------------------------

type BulkItem = {
  id: string;
  file: File;
  previewUrl: string;
  targetId: string; // photoId, or "" for unassigned
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
};

function BulkReplaceDialog({
  rows,
  onClose,
  onUpdated,
}: {
  rows: AdminPhotoRow[];
  onClose: () => void;
  onUpdated: (row: AdminPhotoRow) => void;
}) {
  const [items, setItems] = useState<BulkItem[]>([]);
  const [running, setRunning] = useState(false);
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  const rowById = useMemo(() => new Map(rows.map((r) => [r.photoId, r])), [rows]);

  useEffect(
    () => () => itemsRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl)),
    [],
  );

  function addFiles(files: FileList | File[]) {
    const added: BulkItem[] = Array.from(files).map((file) => {
      const match = matchFileToPhoto(file.name, rows);
      return {
        id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        previewUrl: URL.createObjectURL(file),
        targetId: match.kind === "matched" ? match.photoId : "",
        status: "pending",
      };
    });
    setItems((prev) => [...prev, ...added]);
  }

  function update(id: string, patch: Partial<BulkItem>) {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  const targetCounts = new Map<string, number>();
  for (const item of items) {
    if (item.targetId) targetCounts.set(item.targetId, (targetCounts.get(item.targetId) ?? 0) + 1);
  }
  const duplicate = [...targetCounts.values()].some((n) => n > 1);
  const ready = items.filter((i) => i.status === "pending" || i.status === "error");
  const canRun = !running && !duplicate && ready.length > 0 && ready.every((i) => i.targetId);

  async function run() {
    setRunning(true);
    // Sequential: one decode/encode at a time keeps memory use predictable.
    for (const item of itemsRef.current) {
      if (item.status === "done") continue;
      update(item.id, { status: "uploading", error: undefined });
      try {
        onUpdated(await postForPhoto(replaceUrl(item.targetId), item.file));
        update(item.id, { status: "done" });
      } catch (err) {
        update(item.id, {
          status: "error",
          error: err instanceof Error ? err.message : "Failed",
        });
      }
    }
    setRunning(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col gap-4 overflow-hidden rounded-lg bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Bulk replace</h2>
          <button type="button" onClick={onClose} disabled={running} aria-label="Close" className="text-2xl leading-none text-neutral-500 hover:text-neutral-900">
            ✕
          </button>
        </div>
        <p className="text-sm text-neutral-600">
          Files are matched to a photo by filename when exactly one photo has that name. Existing photos have no
          stored filename until their first replace, so most files in the first batch need a manual match. Nothing
          uploads until you confirm.
        </p>
        <label className="flex cursor-pointer flex-col items-center gap-1 rounded-md border border-dashed border-neutral-300 p-4 text-center text-sm"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            addFiles(e.dataTransfer.files);
          }}
        >
          <span>Drop files here, or click to choose</span>
          <input
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>

        <ul className="flex flex-col gap-2 overflow-y-auto">
          {items.map((item) => {
            const target = rowById.get(item.targetId);
            const clash = !!item.targetId && (targetCounts.get(item.targetId) ?? 0) > 1;
            return (
              <li key={item.id} className="flex items-center gap-3 rounded-md border border-neutral-200 p-2 text-sm">
                <img src={item.previewUrl} alt="" className="h-14 w-14 rounded border border-neutral-200 object-cover" />
                <span className="text-neutral-400">→</span>
                {target ? (
                  <img src={target.thumbUrl} alt="" className="h-14 w-14 rounded border border-neutral-200 object-cover" />
                ) : (
                  <div className="h-14 w-14 rounded border border-dashed border-neutral-300" />
                )}
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="truncate font-medium">{item.file.name}</span>
                  <select
                    value={item.targetId}
                    disabled={running || item.status === "done"}
                    onChange={(e) => update(item.id, { targetId: e.target.value })}
                    className={`${selectClass} max-w-full`}
                  >
                    <option value="">Choose the photo to replace…</option>
                    {rows.map((r) => (
                      <option key={r.photoId} value={r.photoId}>
                        {photoLabel(r)}
                      </option>
                    ))}
                  </select>
                  {clash && <span className="text-xs text-red-600">Another file is also assigned to this photo.</span>}
                  {item.status === "error" && <span className="text-xs text-red-600">{item.error}</span>}
                </div>
                <span className="w-20 text-right text-xs text-neutral-500">
                  {item.status === "done" ? "Done ✓" : item.status === "uploading" ? "Uploading…" : item.status === "error" ? "Failed" : ""}
                </span>
                {item.status !== "done" && item.status !== "uploading" && !running && (
                  <button
                    type="button"
                    aria-label="Remove file"
                    onClick={() => {
                      URL.revokeObjectURL(item.previewUrl);
                      setItems((prev) => prev.filter((i) => i.id !== item.id));
                    }}
                    className="text-neutral-400 hover:text-neutral-900"
                  >
                    ✕
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={running} className={buttonClass}>
            Close
          </button>
          <button type="button" onClick={run} disabled={!canRun} className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
            {running ? "Uploading…" : `Replace ${ready.length} photo${ready.length === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Main -------------------------------------------------------------------

export function AdminPhotoManager({
  initialRows,
  initialQuery,
}: {
  initialRows: AdminPhotoRow[];
  initialQuery: string;
}) {
  const [rows, setRows] = useState(initialRows);
  const [state, setState] = useState<ViewState>(() => parseViewState(new URLSearchParams(initialQuery)));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [regen, setRegen] = useState<{ done: number; total: number; failures: string[] } | null>(null);
  const [regenRunning, setRegenRunning] = useState(false);

  // Keep the URL in step with the view so it can be shared and reloaded.
  useEffect(() => {
    const qs = serializeViewState(state);
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [state]);

  const groups = useMemo(() => applyView(rows, state), [rows, state]);
  const shownCount = groups.reduce((n, g) => n + g.rows.length, 0);
  const selected = rows.find((r) => r.photoId === selectedId) ?? null;
  const missing = rows.filter((r) => r.variantStatus === "missing");

  const spotOptions = useMemo(
    () =>
      [...new Map(rows.map((r) => [r.spotId, r.spotName])).entries()].sort((a, b) =>
        a[1].localeCompare(b[1]),
      ),
    [rows],
  );
  const uploaderOptions = useMemo(
    () =>
      [...new Map(rows.filter((r) => r.uploaderId).map((r) => [r.uploaderId as string, r.uploaderName ?? ""])).entries()].sort(
        (a, b) => a[1].localeCompare(b[1]),
      ),
    [rows],
  );
  const moderationOptions = useMemo(() => [...new Set(rows.map((r) => r.moderationStatus))].sort(), [rows]);

  function setFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setState((s) => ({ ...s, filters: { ...s.filters, [key]: value } }));
  }

  function clickSort(key: SortKey) {
    setState((s) =>
      s.sort === key ? { ...s, dir: s.dir === "asc" ? "desc" : "asc" } : { ...s, sort: key, dir: key === "created" || key === "replaced" ? "desc" : "asc" },
    );
  }

  function applyUpdated(row: AdminPhotoRow) {
    setRows((prev) => prev.map((r) => (r.photoId === row.photoId ? row : r)));
  }

  async function regenerateAllMissing() {
    const queue = rows.filter((r) => r.variantStatus === "missing");
    setRegenRunning(true);
    setRegen({ done: 0, total: queue.length, failures: [] });
    const failures: string[] = [];
    for (let i = 0; i < queue.length; i++) {
      try {
        applyUpdated(await postForPhoto(regenerateUrl(queue[i].photoId)));
      } catch (err) {
        failures.push(`${photoLabel(queue[i])}: ${err instanceof Error ? err.message : "failed"}`);
      }
      setRegen({ done: i + 1, total: queue.length, failures: [...failures] });
    }
    setRegenRunning(false);
  }

  const f = state.filters;
  const sortArrow = (key: SortKey) => (state.sort === key ? (state.dir === "asc" ? " ▲" : " ▼") : "");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <input
          type="search"
          value={f.q}
          onChange={(e) => setFilter("q", e.target.value)}
          placeholder="Search filename, spot, key"
          className={`${selectClass} w-56`}
        />
        <select value={f.source} onChange={(e) => setFilter("source", e.target.value as Filters["source"])} className={selectClass} aria-label="Source">
          <option value="">Any source</option>
          <option value="native">Uploaded</option>
          <option value="external">External URL</option>
        </select>
        <select value={f.variantStatus} onChange={(e) => setFilter("variantStatus", e.target.value as Filters["variantStatus"])} className={selectClass} aria-label="Variant status">
          <option value="">Any variants</option>
          <option value="ready">Variants ready</option>
          <option value="missing">Variants missing</option>
          <option value="n/a">Variants n/a</option>
        </select>
        <select value={f.moderation} onChange={(e) => setFilter("moderation", e.target.value)} className={selectClass} aria-label="Moderation">
          <option value="">Any moderation</option>
          {moderationOptions.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <select value={f.uploader} onChange={(e) => setFilter("uploader", e.target.value)} className={selectClass} aria-label="Uploader">
          <option value="">Any uploader</option>
          <option value={NO_UPLOADER}>No uploader</option>
          {uploaderOptions.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        <select value={f.spot} onChange={(e) => setFilter("spot", e.target.value)} className={`${selectClass} max-w-48`} aria-label="Spot">
          <option value="">Any spot</option>
          {spotOptions.map(([id, name]) => (
            <option key={id} value={String(id)}>
              {name}
            </option>
          ))}
        </select>
        <select value={f.size} onChange={(e) => setFilter("size", e.target.value as Filters["size"])} className={selectClass} aria-label="Resolution">
          <option value="">Any resolution</option>
          <option value="small">Legacy (≤1200px or unknown)</option>
          <option value="large">Full resolution (&gt;1200px)</option>
        </select>
        <label className="flex flex-col text-xs text-neutral-500">
          Created from
          <input type="date" value={f.createdFrom} onChange={(e) => setFilter("createdFrom", e.target.value)} className={selectClass} />
        </label>
        <label className="flex flex-col text-xs text-neutral-500">
          to
          <input type="date" value={f.createdTo} onChange={(e) => setFilter("createdTo", e.target.value)} className={selectClass} />
        </label>
        <button type="button" onClick={() => setState((s) => ({ ...s, filters: { ...s.filters, source: "", variantStatus: "", moderation: "", uploader: "", spot: "", createdFrom: "", createdTo: "", size: "", q: "" } }))} className="text-sm underline">
          Clear filters
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select value={state.group} onChange={(e) => setState((s) => ({ ...s, group: e.target.value as GroupKey }))} className={selectClass} aria-label="Group by">
          {GROUPS.map((g) => (
            <option key={g.key} value={g.key}>
              {g.key === "none" ? g.label : `Group by ${g.label.toLowerCase()}`}
            </option>
          ))}
        </select>
        <div className="flex overflow-hidden rounded border border-neutral-300 text-sm">
          {(["table", "grid"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setState((s) => ({ ...s, view: v }))}
              className={`px-3 py-1 ${state.view === v ? "bg-neutral-900 text-white" : ""}`}
            >
              {v === "table" ? "Table" : "Grid"}
            </button>
          ))}
        </div>
        <span className="text-sm text-neutral-500">
          {shownCount} of {rows.length} photo{rows.length === 1 ? "" : "s"}
        </span>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={() => setBulkOpen(true)} className={buttonClass}>
            Bulk replace…
          </button>
          <button type="button" disabled={regenRunning || missing.length === 0} onClick={regenerateAllMissing} className={buttonClass}>
            {regenRunning ? "Regenerating…" : `Regenerate all missing (${missing.length})`}
          </button>
        </div>
      </div>

      {regen && (
        <div className="rounded-md border border-neutral-200 p-3 text-sm">
          <p>
            Regenerated {regen.done} of {regen.total}
            {regen.failures.length > 0 && ` · ${regen.failures.length} failed`}
            {!regenRunning && " · finished"}
          </p>
          {regen.failures.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-xs text-red-600">
              {regen.failures.map((failure) => (
                <li key={failure}>{failure}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {shownCount === 0 && <p className="text-sm text-neutral-500">No photos match.</p>}

      {groups.map((group) => (
        <details key={group.key} open className="rounded-md border border-neutral-200">
          {state.group !== "none" && (
            <summary className="cursor-pointer bg-neutral-50 px-3 py-2 text-sm font-medium">
              {group.label} <span className="font-normal text-neutral-500">({group.rows.length})</span>
            </summary>
          )}
          {state.view === "table" ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
                    <th className="px-3 py-2 font-medium">Photo</th>
                    {SORTABLE.map(({ key, label }) => (
                      <th key={key} className="px-3 py-2 font-medium">
                        <button type="button" onClick={() => clickSort(key)} className="uppercase tracking-wide">
                          {label}
                          {sortArrow(key)}
                        </button>
                      </th>
                    ))}
                    <th className="px-3 py-2 font-medium">Variants</th>
                    <th className="px-3 py-2 font-medium">Moderation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {group.rows.map((row) => (
                    <tr
                      key={row.photoId}
                      onClick={() => setSelectedId(row.photoId)}
                      className={`cursor-pointer align-middle hover:bg-neutral-50 ${row.photoId === selectedId ? "bg-amber-50" : ""}`}
                    >
                      <td className="px-3 py-2">
                        <img src={row.thumbUrl} alt="" loading="lazy" className="h-12 w-12 rounded border border-neutral-200 object-cover" />
                      </td>
                      <td className="px-3 py-2">{row.spotName}</td>
                      <td className="px-3 py-2">{row.uploaderName ?? "—"}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-neutral-600">{row.createdAt.slice(0, 10)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-neutral-600">{row.replacedAt?.slice(0, 10) ?? "—"}</td>
                      <td className="max-w-40 truncate px-3 py-2 text-xs">{row.originalFilename ?? "—"}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs">{dimensions(row)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs">{formatBytes(row.sizeBytes)}</td>
                      <td className="px-3 py-2 text-xs">{row.variantStatus}</td>
                      <td className="px-3 py-2 text-xs">{row.moderationStatus}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-4 lg:grid-cols-6">
              {group.rows.map((row) => (
                <button
                  key={row.photoId}
                  type="button"
                  onClick={() => setSelectedId(row.photoId)}
                  className={`flex flex-col gap-1 rounded-md border p-1 text-left text-xs ${row.photoId === selectedId ? "border-amber-400 bg-amber-50" : "border-neutral-200"}`}
                >
                  <img src={row.thumbUrl} alt="" loading="lazy" className="aspect-square w-full rounded object-cover" />
                  <span className="truncate font-medium">{row.spotName}</span>
                  <span className="truncate text-neutral-500">
                    {dimensions(row)} · {row.variantStatus}
                  </span>
                </button>
              ))}
            </div>
          )}
        </details>
      ))}

      {selected && <DetailPanel key={selected.photoId} row={selected} onClose={() => setSelectedId(null)} onUpdated={applyUpdated} />}
      {bulkOpen && <BulkReplaceDialog rows={rows} onClose={() => setBulkOpen(false)} onUpdated={applyUpdated} />}
    </div>
  );
}
