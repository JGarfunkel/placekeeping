export function DatabaseWarningBanner() {
  return (
    <div className="border-b border-amber-200 bg-amber-50 px-6 py-2 text-sm text-amber-800">
      We&apos;re having trouble reaching the database right now, so some
      information may be missing and some actions may not work. Please try
      again shortly.
    </div>
  );
}
