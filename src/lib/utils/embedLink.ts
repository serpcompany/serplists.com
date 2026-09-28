// An Embed block's value is shown to viewers as a link, never as HTML: nothing renders
// pasted markup or runs its scripts, and the CSP frame-src allows almost no hosts. The
// value may be a URL, pasted <iframe> code, or plain text (portable templates allow
// "URL or raw text"), so pages link only what resolves to an absolute http(s) URL and
// show the rest as text. Unlike safeUrl (markdown links, uploaded files), this accepts
// no relative paths: resolved against the page, markup or text became a broken link.

// A URL never holds whitespace, angle brackets or quotes; text around a URL, or markup
// after one, would otherwise parse as part of its path.
const NOT_IN_A_URL = /[\s<>"]/;

export function absoluteHttpUrl(value: string): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed || NOT_IN_A_URL.test(trimmed)) {
    return "";
  }

  try {
    const { protocol } = new URL(trimmed);
    return protocol === "http:" || protocol === "https:" ? trimmed : "";
  } catch {
    return "";
  }
}

// The src attribute of the first <iframe>, quoted with " or ' or unquoted.
const IFRAME_SRC = /<iframe\b[^>]*?\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i;

const ATTRIBUTE_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&quot;": '"',
  "&#39;": "'",
  "&#x27;": "'",
  "&lt;": "<",
  "&gt;": ">",
};

const decodeAttribute = (value: string): string =>
  value.replace(/&(?:amp|quot|#39|#x27|lt|gt);/gi, (entity) => ATTRIBUTE_ENTITIES[entity.toLowerCase()] ?? entity);

// The URL viewers are linked to for an Embed block's value: the value itself when it is
// an absolute http(s) URL, else the src of pasted iframe code (embed snippets often use
// a protocol-relative "//host" src). Script tags and other text have none: "".
export function getEmbedLinkUrl(value: string): string {
  const direct = absoluteHttpUrl(value);
  if (direct) {
    return direct;
  }

  const match = typeof value === "string" ? value.match(IFRAME_SRC) : null;
  if (!match) {
    return "";
  }

  const src = decodeAttribute((match[1] ?? match[2] ?? match[3] ?? "").trim());
  return absoluteHttpUrl(src.startsWith("//") ? `https:${src}` : src);
}
