const NOT_IN_A_URL = /[\s<>"]/;

export function absoluteHttpUrl(value: string): string {
  const trimmed = value.trim();
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

const FIRST_IFRAME_SRC_VALUE = /(?<=<iframe\b[^>]*?\ssrc\s*=\s*)(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+)/i;

const QUOTED = /^["']/;

const decodeAttribute = (value: string): string =>
  value
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");

const withHttpsWhenProtocolRelative = (src: string): string => (src.startsWith("//") ? `https:${src}` : src);

const unquoted = (value: string): string => (QUOTED.test(value) ? value.slice(1, -1) : value);

export function getEmbedLinkUrl(value: string): string {
  const direct = absoluteHttpUrl(value);
  if (direct) {
    return direct;
  }

  const match = FIRST_IFRAME_SRC_VALUE.exec(value);
  if (!match) {
    return "";
  }

  const src = decodeAttribute(unquoted(match[0]).trim());
  return absoluteHttpUrl(withHttpsWhenProtocolRelative(src));
}
