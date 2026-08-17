"use client";

import type {
  GroupStewardType,
  StewardCandidate,
} from "@placekeeping/shared-types";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { groupStewardTypeOptions } from "./stewardOptions";

type StewardRef = { stewardId: string; name: string };

const RELATIONSHIP_LABELS: Record<StewardCandidate["relationship"], string> = {
  individual: "",
  admin: "admin",
  member: "member",
};

export function StewardAssociationPicker({
  selected,
  onSelect,
}: {
  selected: StewardRef | null;
  onSelect: (steward: StewardRef | null) => void;
}) {
  const [candidates, setCandidates] = useState<StewardCandidate[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StewardRef[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [mePending, setMePending] = useState(false);
  const [meError, setMeError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/stewards/candidates")
      .then((res) => res.json())
      .then((body) => {
        if (!cancelled) setCandidates(body.candidates ?? []);
      })
      .catch(() => {
        if (!cancelled) setCandidates([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (!open || trimmed.length === 0) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      fetch(`/api/stewards/search?q=${encodeURIComponent(trimmed)}`)
        .then((res) => res.json())
        .then((body) => {
          if (!cancelled) setResults(body.stewards ?? []);
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
  }, [query, open]);

  function handleCreated(steward: StewardRef) {
    setCreateOpen(false);
    setQuery("");
    setOpen(false);
    onSelect(steward);
  }

  const individualCandidate = candidates.find(
    (c) => c.relationship === "individual",
  );
  const groupCandidates = candidates.filter((c) => c.relationship !== "individual");

  // Selects the caller's own individual steward, creating it on the spot
  // (via the same idempotent POST /api/stewards/me the profile page's
  // "Become a steward" button uses) if they don't have one yet -- so
  // stewarding your own spot doesn't require a separate trip to /me first.
  async function handleMe() {
    if (individualCandidate) {
      onSelect({
        stewardId: individualCandidate.stewardId,
        name: individualCandidate.name,
      });
      setOpen(false);
      return;
    }

    setMeError(null);
    setMePending(true);
    try {
      const res = await fetch("/api/stewards/me", { method: "POST" });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          body?.error ? JSON.stringify(body.error) : "Failed to sign up as a steward",
        );
      }
      onSelect({ stewardId: body.steward.stewardId, name: body.steward.name });
      setOpen(false);
    } catch (err) {
      setMeError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setMePending(false);
    }
  }

  if (selected) {
    return (
      <div className="flex items-center gap-2">
        <span className="rounded-md border border-neutral-300 px-3 py-2 text-sm">
          {selected.name}
        </span>
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="text-xs font-medium text-neutral-600 underline hover:text-neutral-900"
        >
          Change
        </button>
      </div>
    );
  }

  const trimmedQuery = query.trim();
  const showingSearch = trimmedQuery.length > 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <input
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          placeholder="Search stewards, or pick from the list…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {open && (
          <div className="absolute z-10 mt-1 w-full rounded-md border border-neutral-200 bg-white shadow-md">
            {showingSearch ? (
              loading ? (
                <p className="px-3 py-2 text-xs text-neutral-500">Searching…</p>
              ) : results.length > 0 ? (
                results.map((r) => (
                  <button
                    key={r.stewardId}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onSelect(r);
                      setQuery("");
                      setOpen(false);
                    }}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-neutral-50"
                  >
                    {r.name}
                  </button>
                ))
              ) : (
                <p className="px-3 py-2 text-xs text-neutral-500">
                  No stewards found
                </p>
              )
            ) : (
              <>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={handleMe}
                  disabled={mePending}
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-neutral-50 disabled:opacity-50"
                >
                  {mePending
                    ? "Signing up…"
                    : (individualCandidate?.name ?? "Me")}
                </button>
                {meError && (
                  <p className="px-3 pb-2 text-xs text-red-600">{meError}</p>
                )}
                {groupCandidates.map((c) => (
                  <button
                    key={c.stewardId}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onSelect({ stewardId: c.stewardId, name: c.name });
                      setOpen(false);
                    }}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-neutral-50"
                  >
                    {c.name}
                    {RELATIONSHIP_LABELS[c.relationship] && (
                      <span className="ml-1 text-xs text-neutral-500">
                        ({RELATIONSHIP_LABELS[c.relationship]})
                      </span>
                    )}
                  </button>
                ))}
                <p className="px-3 py-1 text-xs text-neutral-400">
                  Or type to search all stewards
                </p>
              </>
            )}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => setCreateOpen(true)}
        className="self-start text-xs font-medium text-neutral-600 underline hover:text-neutral-900"
      >
        Can&apos;t find it? Create a new steward
      </button>

      {createOpen && (
        <CreateStewardDialog
          initialName={query.trim()}
          onCreated={handleCreated}
          onClose={() => setCreateOpen(false)}
        />
      )}
    </div>
  );
}

function CreateStewardDialog({
  initialName,
  onCreated,
  onClose,
}: {
  initialName: string;
  onCreated: (steward: StewardRef) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [type, setType] = useState<GroupStewardType>("club");
  const [url, setUrl] = useState("");
  const [contact, setContact] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/stewards/self-service", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          type,
          url: url || null,
          contact,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          body?.error ? JSON.stringify(body.error) : "Failed to create steward",
        );
      }
      onCreated({ stewardId: body.steward.stewardId, name: body.steward.name });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setPending(false);
    }
  }

  // Portalled to document.body -- this dialog's own <form> would otherwise
  // land inside the SpotForm/StewardshipSection <form> that renders the
  // picker, which is invalid HTML (<form> can't nest) and triggers a
  // hydration error.
  return createPortal(
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-sm flex-col gap-4 rounded-md bg-white p-4 shadow-lg"
      >
        <p className="text-sm font-medium">Create a new steward</p>
        <p className="text-xs text-neutral-500">
          You&apos;ll be added as this steward&apos;s admin. We&apos;ll email
          the contact address below to verify the record.
        </p>

        <label className="flex flex-col gap-1 text-sm">
          Name
          <input
            required
            autoFocus
            className="rounded-md border border-neutral-300 px-3 py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Type
          <select
            className="rounded-md border border-neutral-300 px-3 py-2"
            value={type}
            onChange={(e) => setType(e.target.value as GroupStewardType)}
          >
            {groupStewardTypeOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Website
          <input
            type="url"
            placeholder="https://…"
            className="rounded-md border border-neutral-300 px-3 py-2"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Contact email (private — never shown publicly)
          <input
            required
            type="email"
            className="rounded-md border border-neutral-300 px-3 py-2"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
          />
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {pending ? "Creating…" : "Create steward"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
