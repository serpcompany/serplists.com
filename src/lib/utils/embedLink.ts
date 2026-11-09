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

const FIRST_IFRAME_SRC_ATTRIBUTE = /<iframe\b[^>]*?\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i;

const decodeAttribute = (value: string): string =>
  value
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");

const withHttpsWhenProtocolRelative = (src: string): string => (src.startsWith("//") ? `https:${src}` : src);

export function getEmbedLinkUrl(value: string): string {
  const direct = absoluteHttpUrl(value);
  if (direct) {
    return direct;
  }

  const match = value.match(FIRST_IFRAME_SRC_ATTRIBUTE);
  if (!match) {
    return "";
  }

  const src = decodeAttribute((match[1] ?? match[2] ?? match[3] ?? "").trim());
  return absoluteHttpUrl(withHttpsWhenProtocolRelative(src));
}
