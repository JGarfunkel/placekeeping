"use client";

import type { Spot } from "@placekeeping/shared-types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useState } from "react";
import { FormSection } from "@/components/forms/FormSection";
import { StewardshipFields } from "@/components/forms/StewardshipFields";

// slug is optional: a steward just picked in the edit form (via
// StewardAssociationPicker, whose StewardOption shape has no slug) won't
// carry one until the page reloads with server data -- the profile link
// falls back to the uuid identifier in that case (see the dual uuid/slug
// lookup in /stewards/[identifier]).
type StewardRef = { stewardId: string; slug?: string; name: string };

function Field({ label, value }: { label: string; value: ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="text-sm">
      <dt className="text-xs font-medium text-neutral-500">{label}</dt>
      <dd className="text-neutral-900">{value}</dd>
    </div>
  );
}

export function StewardshipSection({
  spot,
  isOwner,
  canEdit,
  currentSteward = null,
}: {
  spot: Spot;
  isOwner: boolean;
  canEdit: boolean;
  currentSteward?: StewardRef | null;
}) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [description, setDescription] = useState(spot.description ?? "");
  const [selectedSteward, setSelectedSteward] = useState(currentSteward);
  const [needs, setNeeds] = useState(spot.needs ?? "");
  const [plans, setPlans] = useState(spot.plans ?? "");
  const [educationalComponent, setEducationalComponent] = useState(
    spot.educationalComponent,
  );
  const [educationalNotes, setEducationalNotes] = useState(
    spot.educationalNotes ?? "",
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEditing() {
    setDescription(spot.description ?? "");
    setSelectedSteward(currentSteward);
    setNeeds(spot.needs ?? "");
    setPlans(spot.plans ?? "");
    setEducationalComponent(spot.educationalComponent);
    setEducationalNotes(spot.educationalNotes ?? "");
    setError(null);
    setIsEditing(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      console.log(
        "[StewardshipSection] saving, selectedSteward =",
        selectedSteward,
      );
      const res = await fetch(`/api/spots/${spot.spotId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: description || undefined,
          stewardId: selectedSteward?.stewardId ?? null,
          needs: needs || undefined,
          plans: plans || undefined,
          educationalComponent,
          educationalNotes: educationalNotes || undefined,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          body?.error
            ? JSON.stringify(body.error)
            : "Failed to save stewardship details",
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
      <span>Stewardship</span>
      {canEdit && !isEditing && (
        <button
          type="button"
          onClick={startEditing}
          aria-label="Edit stewardship details"
          title="Edit stewardship details"
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
            Description
            <textarea
              className="rounded-md border border-neutral-300 px-3 py-2"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>

          <StewardshipFields
            selectedSteward={selectedSteward}
            onSelectedStewardChange={setSelectedSteward}
            needs={needs}
            onNeedsChange={setNeeds}
            plans={plans}
            onPlansChange={setPlans}
            educationalComponent={educationalComponent}
            onEducationalComponentChange={setEducationalComponent}
            educationalNotes={educationalNotes}
            onEducationalNotesChange={setEducationalNotes}
          />

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
        <>
          <dl className="flex flex-col gap-3">
            <Field
              label="Steward"
              value={
                spot.stewardId ? (
                  <>
                    <Link
                      href={`/stewards/${currentSteward?.slug ?? spot.stewardId}`}
                      className="underline"
                    >
                      {currentSteward?.name ?? "View steward profile"}
                    </Link>
                    {isOwner && " (you)"}
                  </>
                ) : (
                  spot.stewardName
                )
              }
            />
            <Field label="Description" value={spot.description} />
            <Field label="Needs" value={spot.needs} />
            <Field label="Plans" value={spot.plans} />
            <Field
              label="Educational component"
              value={
                spot.educationalComponent
                  ? (spot.educationalNotes ?? "Yes")
                  : null
              }
            />
          </dl>

          {!spot.stewardId && !spot.stewardName && (
            <p className="text-sm text-neutral-500">
              This spot doesn&apos;t have a steward yet.
            </p>
          )}
        </>
      )}
    </FormSection>
  );
}
