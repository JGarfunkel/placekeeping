import { readFile } from "node:fs/promises";
import path from "node:path";

const CONTENT_DIR = path.join(process.cwd(), "src/content");

export async function readDocumentHtml(slug: string): Promise<string> {
  return readFile(path.join(CONTENT_DIR, `${slug}.html`), "utf8");
}
