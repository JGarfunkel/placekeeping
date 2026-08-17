import { readFile } from "node:fs/promises";
import path from "node:path";

const CONTENT_DIR = path.join(process.cwd(), "src/content");

export async function readDocumentHtml(slug: string): Promise<string> {
  const html = await readFile(path.join(CONTENT_DIR, `${slug}.html`), "utf8");
  // Normalize CRLF (checked out as-is on Windows) to LF -- otherwise the raw
  // \r\n ends up in the dangerouslySetInnerHTML string while the browser's
  // HTML parser normalizes it to \n, causing a hydration mismatch.
  return html.replace(/\r\n/g, "\n");
}

// Docs served at /about/[slug]. "about" itself lives at /about via its own
// static page.tsx, not through this map. Add an entry + matching
// src/content/{slug}.html to publish a new one.
export const aboutDocs = {
  guidelines: "Guidelines",
  origins: "Origins",
  philosophy: "Site Philosophy",
  theory: "Theory",
  usage: "Usage",
  examples: "Examples",
} as const;

export type AboutDocSlug = keyof typeof aboutDocs;
