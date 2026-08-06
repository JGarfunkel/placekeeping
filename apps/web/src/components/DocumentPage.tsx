export function DocumentPage({ title, html }: { title: string; html: string }) {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-8">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <div
        className="flex flex-col gap-4 text-sm text-neutral-700"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </main>
  );
}
