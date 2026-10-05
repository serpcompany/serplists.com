import 'server-only';

export function routeParam(value: string | string[] | undefined): string {
  const raw = (Array.isArray(value) ? value[0] : value) ?? '';
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export type RouteSearchParams = Record<string, string | string[] | undefined>;

export function routeQuery(searchParams: RouteSearchParams): string {
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(searchParams)) {
    for (const item of typeof value === 'string' ? [value] : value ?? []) query.append(name, item);
  }
  const text = query.toString();
  return text ? `?${text}` : '';
}
