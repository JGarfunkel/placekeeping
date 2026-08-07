"use client";

import type { Site } from "@placekeeping/shared-types";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useState } from "react";
import { FormSection } from "@/components/forms/FormSection";
import { sitePurposeOptions } from "@/components/forms/spotOptions";
import { sitePurposeLabels } from "@/lib/siteLabels";

function Field({ label, value }: { label: string; value: ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="text-sm">
      <dt className="text-xs font-medium text-neutral-500">{label}</dt>
      <dd className="text-neutral-900">{value}</dd>
    </div>
  );
}

export function SiteDetailsEditor({
  site,
  canEdit,
}: {
  site: Site;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [purpose, setPurpose] = useState(site.purpose ?? "");
  const [legalOwner, setLegalOwner] = useState(site.legalOwner ?? "");
  const [stewardshipProgram, setStewardshipProgram] = useState(
    site.stewardshipProgram ?? "",
  );
  const [stewardshipRef, setStewardshipRef] = useState(
    site.stewardshipRef ?? "",
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEditing() {
    setPurpose(site.purpose ?? "");
    setLegalOwner(site.legalOwner ?? "");
    setStewardshipProgram(site.stewardshipProgram ?? "");
    setStewardshipRef(site.stewardshipRef ?? "");
    setError(null);
    setIsEditing(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`/api/sites/${site.siteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purpose: purpose || undefined,
          legalOwner: legalOwner || undefined,
          stewardshipProgram: stewardshipProgram || undefined,
          stewardshipRef: stewardshipRef || undefined,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          body?.error ? JSON.stringify(body.error) : "Failed to save site details",
        );
      }
      setIsEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setPending(false);
    }
  }

  const title = (
    <div className="flex items-center justify-between">
      <span>Details</span>
      {canEdit && !isEditing && (
        <button
          type="button"
          onClick={startEditing}
          aria-label="Edit site details"
          title="Edit site details"
          className="text-neutral-500 hover:text-neutral-900"
        >
          ✎
        </button>
      )}
    </div>
  );

  return (
    <FormSection title={title} collapsible={false}>
      {isEditing ? (
        <form onSubmit={handleSave} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Purpose
            <select
              className="rounded-md border border-neutral-300 px-3 py-2"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
            >
              <option value="">Not set</option>
              {sitePurposeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Legal owner
            <input
              type="text"
              className="rounded-md border border-neutral-300 px-3 py-2"
              value={legalOwner}
              onChange={(e) => setLegalOwner(e.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Stewardship program
            <input
              type="text"
              className="rounded-md border border-neutral-300 px-3 py-2"
              value={stewardshipProgram}
              onChange={(e) => setStewardshipProgram(e.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Stewardship reference
            <input
              type="text"
              className="rounded-md border border-neutral-300 px-3 py-2"
              value={stewardshipRef}
              onChange={(e) => setStewardshipRef(e.target.value)}
            />
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              disabled={pending}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-50"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <dl className="flex flex-col gap-3">
          <Field
            label="Purpose"
            value={site.purpose ? (sitePurposeLabels[site.purpose] ?? site.purpose) : null}
          />
          <Field label="Legal owner" value={site.legalOwner} />
          <Field label="Stewardship program" value={site.stewardshipProgram} />
          <Field label="Stewardship reference" value={site.stewardshipRef} />
          {!site.purpose &&
            !site.legalOwner &&
            !site.stewardshipProgram &&
            !site.stewardshipRef && (
              <p className="text-sm text-neutral-500">No details added yet.</p>
            )}
        </dl>
      )}
    </FormSection>
  );
}
