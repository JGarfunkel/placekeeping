export function FormSection({
  title,
  defaultOpen = true,
  collapsible = true,
  children,
}: {
  title: React.ReactNode;
  defaultOpen?: boolean;
  collapsible?: boolean;
  children: React.ReactNode;
}) {
  if (!collapsible) {
    return (
      <div className="rounded-md border border-neutral-200">
        <div className="px-4 py-3 text-sm font-semibold text-neutral-900">
          {title}
        </div>
        <div className="flex flex-col gap-4 border-t border-neutral-200 px-4 py-4">
          {children}
        </div>
      </div>
    );
  }

  return (
    <details
      open={defaultOpen}
      className="group rounded-md border border-neutral-200"
    >
      <summary className="cursor-pointer select-none list-none px-4 py-3 text-sm font-semibold text-neutral-900 marker:content-none">
        <span className="mr-2 inline-block transition-transform group-open:rotate-90">
          ▸
        </span>
        {title}
      </summary>
      <div className="flex flex-col gap-4 border-t border-neutral-200 px-4 py-4">
        {children}
      </div>
    </details>
  );
}
