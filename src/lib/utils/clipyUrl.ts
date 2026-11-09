const CLIPY_HOSTS = new Set(['clipy.online', 'www.clipy.online']);
const CLIPY_VIDEO_PATH = /^\/(?:video|embed)\/([a-zA-Z0-9_-]+)\/?$/;

const CLIPY_REFERRER = 'm4d8e9p';
const CLIPY_UTM_SOURCE = 'serplists.com';

export function isClipyHost(hostname: string): boolean {
  return CLIPY_HOSTS.has(hostname);
}

function parseClipyUrl(value: string): URL | null {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && CLIPY_HOSTS.has(parsed.hostname) ? parsed : null;
  } catch {
    return null;
  }
}

const withReferral = (clipyUrl: URL): string => {
  clipyUrl.hostname = 'clipy.online';
  clipyUrl.searchParams.set('ref', CLIPY_REFERRER);
  clipyUrl.searchParams.set('utm_source', CLIPY_UTM_SOURCE);
  return clipyUrl.toString();
};

export function clipyVideoId(parsed: URL): string | null {
  if (!CLIPY_HOSTS.has(parsed.hostname)) return null;
  return parsed.pathname.match(CLIPY_VIDEO_PATH)?.[1] ?? null;
}

export const withSerpListsClipyRef = (clipyUrl: string): string => withReferral(new URL(clipyUrl));

export function getOutboundLinkProps(value: string) {
  const clipyUrl = parseClipyUrl(value);
  return clipyUrl
    ? { href: withReferral(clipyUrl), target: '_blank' as const, rel: 'nofollow noopener noreferrer' }
    : { href: value, target: '_blank' as const, rel: 'noopener noreferrer' };
}
