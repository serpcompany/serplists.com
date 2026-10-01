const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

const isInPageAnchorOrSitePath = (value: string): boolean => value.startsWith("#") || value.startsWith("/");

export function safeUrl(url: string): string {
  const value = (url ?? "").trim();
  if (!value) return "";

  if (isInPageAnchorOrSitePath(value)) return value;

  try {
    const parsed = new URL(value, "https://example.com");
    if (!SAFE_PROTOCOLS.has(parsed.protocol)) return "";
    return value;
  } catch {
    return "";
  }
}

const IMAGE_PROTOCOLS = new Set(["http:", "https:"]);

export function safeImageUrl(url: string): string {
  const value = safeUrl(url);
  if (!value || value.startsWith("#")) return "";
  if (value.startsWith("/")) return value;

  try {
    return IMAGE_PROTOCOLS.has(new URL(value).protocol) ? value : "";
  } catch {
    return "";
  }
}
