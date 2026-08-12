export default function OfflinePage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      <h1 className="text-xl font-semibold">You&rsquo;re offline</h1>
      <p className="max-w-sm text-sm text-neutral-600">
        Placekeeping needs a connection to load maps, spots, and stewardship
        activity. Reconnect and try again.
      </p>
    </div>
  );
}
