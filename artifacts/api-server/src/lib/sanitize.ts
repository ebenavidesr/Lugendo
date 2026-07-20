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

// Allowlist for uploaded SVG logos: shape/container/gradient/text tags only, and only the
// presentation attributes they legitimately need. No <script>, <foreignObject>, <iframe>,
// <use> (can pull in external content via href), event handlers (on*), or href/xlink:href of
// any kind -- since none of those attributes are listed, sanitize-html strips them regardless
// of scheme, so there's no javascript: URI to filter around.
const SVG_TAGS = [
  "svg", "g", "path", "circle", "ellipse", "rect", "line", "polyline", "polygon",
  "text", "tspan", "defs", "clipPath", "mask", "symbol", "title", "desc",
  "linearGradient", "radialGradient", "stop", "style",
];

const SVG_PRESENTATION_ATTRS = [
  "id", "class", "style", "transform", "fill", "fill-rule", "fill-opacity", "stroke",
  "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "opacity",
  "clip-rule", "clip-path", "mask", "font-family", "font-size", "font-weight", "text-anchor",
];

const SVG_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: SVG_TAGS,
  allowedAttributes: {
    svg: ["viewBox", "width", "height", "xmlns", ...SVG_PRESENTATION_ATTRS],
    path: ["d", ...SVG_PRESENTATION_ATTRS],
    g: [...SVG_PRESENTATION_ATTRS],
    circle: ["cx", "cy", "r", ...SVG_PRESENTATION_ATTRS],
    ellipse: ["cx", "cy", "rx", "ry", ...SVG_PRESENTATION_ATTRS],
    rect: ["x", "y", "width", "height", "rx", "ry", ...SVG_PRESENTATION_ATTRS],
    line: ["x1", "y1", "x2", "y2", ...SVG_PRESENTATION_ATTRS],
    polyline: ["points", ...SVG_PRESENTATION_ATTRS],
    polygon: ["points", ...SVG_PRESENTATION_ATTRS],
    text: ["x", "y", "dx", "dy", ...SVG_PRESENTATION_ATTRS],
    tspan: ["x", "y", "dx", "dy", ...SVG_PRESENTATION_ATTRS],
    linearGradient: ["id", "x1", "y1", "x2", "y2", "gradientUnits", "gradientTransform"],
    radialGradient: ["id", "cx", "cy", "r", "fx", "fy", "gradientUnits", "gradientTransform"],
    stop: ["offset", "stop-color", "stop-opacity"],
    clipPath: ["id"],
    mask: ["id"],
    symbol: ["id", "viewBox"],
  },
  allowedSchemes: [],
};

export function sanitizeSvg(svg: string): string {
  return sanitizeHtml(svg, SVG_SANITIZE_OPTIONS).trim();
}
