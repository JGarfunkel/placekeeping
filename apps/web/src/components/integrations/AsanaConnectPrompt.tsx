// Shown on a stewarded spot to a signed-in user who has not linked Asana.
// Sends them through OAuth and back to this page.
export function AsanaConnectPrompt({
  returnTo,
  message,
}: {
  returnTo: string;
  message: string;
}) {
  return (
    <section className="flex flex-col gap-2 rounded-md border border-neutral-200 p-4 text-sm">
      <h2 className="text-base font-medium">Asana</h2>
      <p className="text-neutral-600">{message}</p>
      <div>
        <a
          href={`/api/integrations/asana/connect?returnTo=${encodeURIComponent(returnTo)}`}
          className="inline-block rounded-md bg-neutral-900 px-4 py-2 font-medium text-white"
        >
          Connect Asana
        </a>
      </div>
    </section>
  );
}
