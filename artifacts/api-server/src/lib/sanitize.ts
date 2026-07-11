import sanitizeHtml from "sanitize-html";

// Minimal allowlist for user-authored rich text (trip notes): bold/italic/lists only, no links
// or images -- there's no legitimate reason for a personal note to embed either, and it keeps
// the sanitization surface small. Anything else (script, style, on* handlers, iframe, svg, etc.)
// is stripped; disallowed tags are unwrapped (their text content is kept, the tag itself removed).
const NOTE_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ["p", "div", "br", "strong", "b", "em", "i", "ul", "ol", "li"],
  allowedAttributes: {},
};

export function sanitizeNoteHtml(html: string): string {
  return sanitizeHtml(html, NOTE_SANITIZE_OPTIONS).trim();
}
