import "server-only";

import { marked } from "marked";
import sanitizeHtml from "sanitize-html";
import { getAppBaseUrl } from "./appBaseUrl";

// Links that stay inside the app: "/spots/12", "#section", or an absolute URL
// on our own origin (rewritten to its path so it survives a domain change).
// Protocol-relative "//host" is NOT local -- it points off-site.
function localHref(href: string): string | null {
  if (href.startsWith("#")) return href;
  if (href.startsWith("/") && !href.startsWith("//") && !href.startsWith("/\\")) {
    return href;
  }
  try {
    const url = new URL(href);
    if (url.origin === new URL(getAppBaseUrl()).origin) {
      return `${url.pathname}${url.search}${url.hash}`;
    }
  } catch {
    // not an absolute URL
  }
  return null;
}

// Notes are markdown, and markdown permits inline HTML -- so everything marked
// emits goes through this allowlist before it reaches dangerouslySetInnerHTML.
// Anything not listed (script, style, iframe, forms, event-handler attributes,
// javascript: URLs, ...) is dropped. Sanitizing at render time rather than on
// save means tightening this list also cleans up already-stored notes.
const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "h1", "h2", "h3", "h4", "p", "br", "hr", "blockquote",
    "ul", "ol", "li", "strong", "b", "em", "i", "u", "s", "del",
    "code", "pre", "a", "img",
    "table", "thead", "tbody", "tr", "th", "td",
  ],
  allowedAttributes: {
    // target/rel are set by the transform below; they must be allowed here or
    // the sanitizer strips them after the transform runs.
    a: ["href", "title", "target", "rel"],
    img: ["src", "alt", "title"],
    th: ["align"],
    td: ["align"],
  },
  // No data: URIs (would allow inline SVG/HTML payloads), no javascript:.
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: { img: ["http", "https"] },
  // "//host/..." has no scheme, so would otherwise slip past allowedSchemes.
  allowProtocolRelative: false,
  transformTags: {
    // Rebuild the attributes from scratch so an author's own target/rel can't
    // survive: local links open in the same tab, external ones in a new,
    // isolated one.
    a: (tagName, attribs) => {
      const attributes: Record<string, string> = {};
      if (attribs.title) attributes.title = attribs.title;
      const href = attribs.href;
      if (href !== undefined) {
        const local = localHref(href);
        if (local !== null) {
          attributes.href = local;
        } else {
          attributes.href = href;
          attributes.rel = "noopener noreferrer nofollow";
          attributes.target = "_blank";
        }
      }
      return { tagName, attribs: attributes };
    },
  },
};

export function renderNoteHtml(markdown: string): string {
  const html = marked.parse(markdown, { async: false, gfm: true, breaks: true });
  return sanitizeHtml(html, SANITIZE_OPTIONS);
}
