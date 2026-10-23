// `html` must already be sanitized (renderNoteHtml). Shared by the saved-note
// card and the editor preview so both render identically.
export function NoteHtml({ html }: { html: string }) {
  return (
    <div
      className="prose prose-sm prose-neutral max-w-none prose-a:text-green-700"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
