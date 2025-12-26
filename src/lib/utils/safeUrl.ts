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

