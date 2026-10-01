export function parseAllowedOrigin(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (!url.hostname || url.hostname.includes('*') || url.username || url.password) return null;
  return url.origin === 'null' ? null : url.origin;
}

export type OriginList = { origins: string[]; invalid: string[] };

export function parseOriginList(raw: string): OriginList {
  const origins: string[] = [];
  const invalid: string[] = [];
  for (const entry of raw.split(',')) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const origin = parseAllowedOrigin(trimmed);
    if (origin) origins.push(origin);
    else invalid.push(trimmed);
  }
  return { origins, invalid };
}

export function describeOriginListProblem(raw: string): string | null {
  const { origins, invalid } = parseOriginList(raw);
  if (invalid.length > 0) {
    return `CORS_ALLOWED_ORIGINS entries must be http(s) origins such as https://serplists.com; invalid: ${invalid.join(', ')}`;
  }
  if (origins.length === 0) return 'CORS_ALLOWED_ORIGINS is set but lists no origins';
  return null;
}

export function describeFrontendUrlProblem(raw: string): string | null {
  return parseAllowedOrigin(raw) ? null : 'FRONTEND_URL must be an http(s) URL such as https://serplists.com';
}
