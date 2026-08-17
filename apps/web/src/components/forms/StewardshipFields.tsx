import { StewardAssociationPicker } from "./StewardAssociationPicker";

type StewardRef = { stewardId: string; name: string };

export function StewardshipFields({
  selectedSteward,
  onSelectedStewardChange,
  stewardIsOwner,
  onStewardIsOwnerChange,
  needs,
  onNeedsChange,
  plans,
  onPlansChange,
  educationalComponent,
  onEducationalComponentChange,
  educationalNotes,
  onEducationalNotesChange,
}: {
  selectedSteward: StewardRef | null;
  onSelectedStewardChange: (steward: StewardRef | null) => void;
  stewardIsOwner: boolean;
  onStewardIsOwnerChange: (value: boolean) => void;
  needs: string;
  onNeedsChange: (value: string) => void;
  plans: string;
  onPlansChange: (value: string) => void;
  educationalComponent: boolean;
  onEducationalComponentChange: (value: boolean) => void;
  educationalNotes: string;
  onEducationalNotesChange: (value: string) => void;
}) {
  return (
    <>
      <div className="flex flex-col gap-1 text-sm">
        Steward
        <StewardAssociationPicker
          selected={selectedSteward}
          onSelect={onSelectedStewardChange}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={stewardIsOwner}
            onChange={(e) => onStewardIsOwnerChange(e.target.checked)}
          />
          Privately owned (the steward is the property&apos;s legal owner,
          not a third-party caretaker)
        </label>
        {stewardIsOwner && !selectedSteward && (
          <p className="pl-6 text-xs text-neutral-500">
            No steward linked yet — the owner can claim this spot later by
            registering as a steward.
          </p>
        )}
      </div>

      <label className="flex flex-col gap-1 text-sm">
        Needs
        <textarea
          className="rounded-md border border-neutral-300 px-3 py-2"
          rows={2}
          value={needs}
          onChange={(e) => onNeedsChange(e.target.value)}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Plans
        <textarea
          className="rounded-md border border-neutral-300 px-3 py-2"
          rows={2}
          value={plans}
          onChange={(e) => onPlansChange(e.target.value)}
        />
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={educationalComponent}
          onChange={(e) => onEducationalComponentChange(e.target.checked)}
        />
        Has an educational component (signage, school programs, tours…)
      </label>

      {educationalComponent && (
        <label className="flex flex-col gap-1 text-sm">
          Educational notes
          <textarea
            className="rounded-md border border-neutral-300 px-3 py-2"
            rows={2}
            value={educationalNotes}
            onChange={(e) => onEducationalNotesChange(e.target.value)}
          />
        </label>
      )}
    </>
  );
}
