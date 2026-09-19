const CLIPY_HOSTS = new Set(['clipy.online', 'www.clipy.online']);

export const CLIPY_REFERRER = 'm4d8e9p';
export const CLIPY_UTM_SOURCE = 'serplists.com';

export function isClipyUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && CLIPY_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

export function withSerpListsClipyRef(value: string): string {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || !CLIPY_HOSTS.has(parsed.hostname)) {
      return value;
    }

    parsed.hostname = 'clipy.online';
    parsed.searchParams.set('ref', CLIPY_REFERRER);
    parsed.searchParams.set('utm_source', CLIPY_UTM_SOURCE);
    return parsed.toString();
  } catch {
    return value;
  }
}

export function getOutboundLinkProps(value: string) {
  const href = isClipyUrl(value) ? withSerpListsClipyRef(value) : value;
  return {
    href,
    target: '_blank' as const,
    rel: isClipyUrl(href) ? 'nofollow noopener noreferrer' : 'noopener noreferrer',
  };
}
