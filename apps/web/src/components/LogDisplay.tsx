import Link from "next/link";

export interface LogEntry {
  id: string;
  kind: "user" | "site" | "spot" | "observation";
  title: string;
  detail?: string | null;
  timestamp: string;
  href: string;
}

const KIND_LABELS: Record<LogEntry["kind"], string> = {
  user: "New user",
  site: "New site",
  spot: "New spot",
  observation: "New observation",
};

export function LogDisplay({ entries }: { entries: LogEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-neutral-500">No recent activity.</p>;
  }

  return (
    <ul className="flex flex-col divide-y divide-neutral-200">
      {entries.map((entry) => (
        <li key={entry.id} className="flex items-center justify-between gap-4 py-2">
          <div className="flex flex-col">
            <span className="text-xs uppercase tracking-wide text-neutral-500">
              {KIND_LABELS[entry.kind]}
            </span>
            <Link href={entry.href} className="text-sm font-medium underline">
              {entry.title}
            </Link>
            {entry.detail && (
              <span className="text-sm text-neutral-600">{entry.detail}</span>
            )}
          </div>
          <span className="shrink-0 text-xs text-neutral-500">
            {new Date(entry.timestamp).toLocaleString()}
          </span>
        </li>
      ))}
    </ul>
  );
}
