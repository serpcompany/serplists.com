const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

export function safeUrl(url: string): string {
  const value = (url ?? "").trim();
  if (!value) return "";

  // Allow in-page anchors and absolute paths.
  if (value.startsWith("#") || value.startsWith("/")) return value;

  try {
    const parsed = new URL(value, "https://example.com");
    if (!SAFE_PROTOCOLS.has(parsed.protocol)) return "";
    return value;
  } catch {
    return "";
  }
}


const IMAGE_PROTOCOLS = new Set(["http:", "https:"]);

// An image source must be an absolute http(s) URL or an app path such as an upload.
// mailto:, tel:, in-page anchors and bare relative names can never load as images,
// so they get no request at all.
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
