import type { AdminPhotoRow } from "@placekeeping/shared-types";

// Pure filter/sort/group logic for the admin photo manager, kept free of
// React so it is unit-testable and can move server-side if the photo count
// ever outgrows loading everything.

export type SortKey =
  | "created"
  | "replaced"
  | "uploader"
  | "spot"
  | "longEdge"
  | "bytes"
  | "filename";
export type SortDir = "asc" | "desc";
export type GroupKey =
  | "none"
  | "observation"
  | "spot"
  | "uploader"
  | "month"
  | "source"
  | "variantStatus"
  | "moderation";
export type ViewMode = "table" | "grid";

export type Filters = {
  source: AdminPhotoRow["source"] | "";
  variantStatus: AdminPhotoRow["variantStatus"] | "";
  moderation: string;
  uploader: string; // uploaderId, or NO_UPLOADER
  spot: string; // spotId as a string
  createdFrom: string; // YYYY-MM-DD, inclusive
  createdTo: string; // YYYY-MM-DD, inclusive
  size: "" | "small" | "large";
  q: string;
};

export type ViewState = {
  filters: Filters;
  sort: SortKey;
  dir: SortDir;
  group: GroupKey;
  view: ViewMode;
};

/** Sentinel for the uploader filter: photos whose uploader account is gone. */
export const NO_UPLOADER = "none";

/**
 * Legacy photos were capped at 1200px by the old pipeline (and have no stored
 * dimensions at all), so "small" means unknown or <= this; "large" means a
 * stored original bigger than it.
 */
export const LEGACY_MAX_LONG_EDGE_PX = 1200;

export const DEFAULT_VIEW: ViewState = {
  filters: {
    source: "",
    variantStatus: "",
    moderation: "",
    uploader: "",
    spot: "",
    createdFrom: "",
    createdTo: "",
    size: "",
    q: "",
  },
  sort: "created",
  dir: "desc",
  group: "none",
  view: "table",
};

export function longEdge(row: AdminPhotoRow): number | null {
  return row.originalW && row.originalH ? Math.max(row.originalW, row.originalH) : null;
}

export function applyFilters(rows: AdminPhotoRow[], f: Filters): AdminPhotoRow[] {
  const q = f.q.trim().toLowerCase();
  return rows.filter((row) => {
    if (f.source && row.source !== f.source) return false;
    if (f.variantStatus && row.variantStatus !== f.variantStatus) return false;
    if (f.moderation && row.moderationStatus !== f.moderation) return false;
    if (f.uploader) {
      if (f.uploader === NO_UPLOADER ? row.uploaderId !== null : row.uploaderId !== f.uploader) {
        return false;
      }
    }
    if (f.spot && String(row.spotId) !== f.spot) return false;
    // createdAt is an ISO timestamp, so its first 10 chars compare as a date.
    const day = row.createdAt.slice(0, 10);
    if (f.createdFrom && day < f.createdFrom) return false;
    if (f.createdTo && day > f.createdTo) return false;
    if (f.size) {
      const edge = longEdge(row);
      const small = edge === null || edge <= LEGACY_MAX_LONG_EDGE_PX;
      if (f.size === "small" ? !small : small) return false;
    }
    if (q) {
      const haystack = [row.originalFilename, row.spotName, row.storageKey]
        .filter(Boolean)
        .join("\n")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

function compareNullable<T extends string | number>(a: T | null, b: T | null): number {
  // Nulls always sort last in ascending order, so they stay out of the way.
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : a > b ? 1 : 0;
}

function sortValue(row: AdminPhotoRow, key: SortKey): string | number | null {
  switch (key) {
    case "created":
      return row.createdAt;
    case "replaced":
      return row.replacedAt;
    case "uploader":
      return row.uploaderName?.toLowerCase() ?? null;
    case "spot":
      return row.spotName.toLowerCase();
    case "longEdge":
      return longEdge(row);
    case "bytes":
      return row.sizeBytes;
    case "filename":
      return row.originalFilename?.toLowerCase() ?? null;
  }
}

export function sortRows(rows: AdminPhotoRow[], key: SortKey, dir: SortDir): AdminPhotoRow[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = sortValue(a, key);
    const bv = sortValue(b, key);
    // Keep nulls last regardless of direction.
    if (av === null || bv === null) return compareNullable(av, bv);
    return compareNullable(av, bv) * sign || a.photoId.localeCompare(b.photoId);
  });
}

export type PhotoGroup = { key: string; label: string; rows: AdminPhotoRow[] };

function groupOf(row: AdminPhotoRow, group: GroupKey): { key: string; label: string } {
  switch (group) {
    case "none":
      return { key: "all", label: "All photos" };
    case "observation":
      return { key: row.observationId, label: `${row.spotName}, observation ${row.observationId.slice(0, 8)}` };
    case "spot":
      return { key: String(row.spotId), label: row.spotName };
    case "uploader":
      return { key: row.uploaderId ?? NO_UPLOADER, label: row.uploaderName ?? "Unknown uploader" };
    case "month": {
      const month = row.createdAt.slice(0, 7);
      return { key: month, label: month };
    }
    case "source":
      return { key: row.source, label: row.source === "native" ? "Uploaded" : "External URL" };
    case "variantStatus":
      return { key: row.variantStatus, label: `Variants: ${row.variantStatus}` };
    case "moderation":
      return { key: row.moderationStatus, label: `Moderation: ${row.moderationStatus}` };
  }
}

/** Groups already-sorted rows, keeping first-seen group order and row order within each. */
export function groupRows(rows: AdminPhotoRow[], group: GroupKey): PhotoGroup[] {
  const groups = new Map<string, PhotoGroup>();
  for (const row of rows) {
    const { key, label } = groupOf(row, group);
    const existing = groups.get(key);
    if (existing) existing.rows.push(row);
    else groups.set(key, { key, label, rows: [row] });
  }
  return [...groups.values()];
}

export function applyView(rows: AdminPhotoRow[], state: ViewState): PhotoGroup[] {
  return groupRows(sortRows(applyFilters(rows, state.filters), state.sort, state.dir), state.group);
}

// --- URL query string round trip ------------------------------------------
// Only non-default values are written, so a fresh page has a clean URL.

const SORT_KEYS: SortKey[] = ["created", "replaced", "uploader", "spot", "longEdge", "bytes", "filename"];
const GROUP_KEYS: GroupKey[] = ["none", "observation", "spot", "uploader", "month", "source", "variantStatus", "moderation"];

function pick<T extends string>(value: string | null | undefined, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

export function parseViewState(params: URLSearchParams): ViewState {
  const get = (name: string) => params.get(name) ?? "";
  const d = DEFAULT_VIEW;
  return {
    filters: {
      source: pick(get("source"), ["", "native", "external"] as const, d.filters.source),
      variantStatus: pick(get("variants"), ["", "ready", "missing", "n/a"] as const, d.filters.variantStatus),
      moderation: get("moderation"),
      uploader: get("uploader"),
      spot: get("spot"),
      createdFrom: get("from"),
      createdTo: get("to"),
      size: pick(get("size"), ["", "small", "large"] as const, d.filters.size),
      q: get("q"),
    },
    sort: pick(get("sort"), SORT_KEYS, d.sort),
    dir: pick(get("dir"), ["asc", "desc"] as const, d.dir),
    group: pick(get("group"), GROUP_KEYS, d.group),
    view: pick(get("view"), ["table", "grid"] as const, d.view),
  };
}

export function serializeViewState(state: ViewState): string {
  const d = DEFAULT_VIEW;
  const params = new URLSearchParams();
  const set = (name: string, value: string, fallback = "") => {
    if (value !== fallback) params.set(name, value);
  };
  set("source", state.filters.source);
  set("variants", state.filters.variantStatus);
  set("moderation", state.filters.moderation);
  set("uploader", state.filters.uploader);
  set("spot", state.filters.spot);
  set("from", state.filters.createdFrom);
  set("to", state.filters.createdTo);
  set("size", state.filters.size);
  set("q", state.filters.q);
  set("sort", state.sort, d.sort);
  set("dir", state.dir, d.dir);
  set("group", state.group, d.group);
  set("view", state.view, d.view);
  return params.toString();
}

// --- Bulk replace matching --------------------------------------------------

export type BulkMatch =
  | { kind: "matched"; photoId: string }
  | { kind: "ambiguous"; photoIds: string[] }
  | { kind: "unmatched" };

/**
 * Matches a dropped file to a photo by originalFilename (case-insensitive),
 * only when exactly one row has that name. Existing rows have no stored
 * filename until their first replace, so the first batch is mostly manual.
 */
export function matchFileToPhoto(filename: string, rows: AdminPhotoRow[]): BulkMatch {
  const name = filename.toLowerCase();
  const hits = rows.filter((r) => r.originalFilename?.toLowerCase() === name);
  if (hits.length === 1) return { kind: "matched", photoId: hits[0].photoId };
  if (hits.length > 1) return { kind: "ambiguous", photoIds: hits.map((r) => r.photoId) };
  return { kind: "unmatched" };
}

export function formatBytes(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
