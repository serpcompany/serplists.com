import 'server-only';

export function routeParam(value: string | string[] | undefined): string {
  const raw = (Array.isArray(value) ? value[0] : value) ?? '';
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
