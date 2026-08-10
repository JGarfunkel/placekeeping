import { readFile } from "node:fs/promises";
import path from "node:path";

const CONTENT_DIR = path.join(process.cwd(), "src/content");

export async function readDocumentHtml(slug: string): Promise<string> {
  return readFile(path.join(CONTENT_DIR, `${slug}.html`), "utf8");
}

// Docs served at /about/[slug]. "about" itself lives at /about via its own
// static page.tsx, not through this map. Add an entry + matching
// src/content/{slug}.html to publish a new one.
export const aboutDocs = {
  guidelines: "Guidelines",
  history: "History",
  philosophy: "Site Philosophy",
  theory: "Theory",
} as const;

export type AboutDocSlug = keyof typeof aboutDocs;
