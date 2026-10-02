import { clipyVideoId, isClipyHost, withSerpListsClipyRef } from '@/lib/utils/clipyUrl';
import { isEmbedFrameOrigin } from '@/lib/utils/embedOrigins';

const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_PLAYLIST_EMBED_ID = 'videoseries';
const YOUTUBE_ID_PATH_PREFIXES = new Set(['embed', 'shorts', 'live', 'v', 'e']);

const normalizeHostname = (hostname: string) => hostname.toLowerCase().replace(/\.$/, '');

const isHostOrSubdomain = (hostname: string, domain: string) =>
  hostname === domain || hostname.endsWith(`.${domain}`);

const isYoutubeHostname = (hostname: string): boolean => {
  const host = normalizeHostname(hostname);
  return (
    host === 'youtu.be' ||
    isHostOrSubdomain(host, 'youtube.com') ||
    isHostOrSubdomain(host, 'youtube-nocookie.com')
  );
};

export const getYoutubeVideoId = (url: string | URL): string | null => {
  let parsed: URL;
  try {
    parsed = typeof url === 'string' ? new URL(url) : url;
  } catch {
    return null;
  }
  if (!isYoutubeHostname(parsed.hostname)) return null;

  const segments = parsed.pathname.split('/').filter(Boolean);
  const prefix = segments[0]?.toLowerCase();
  let candidate: string | null | undefined;
  if (normalizeHostname(parsed.hostname) === 'youtu.be') {
    candidate = segments[0];
  } else if (prefix === 'watch') {
    candidate = parsed.searchParams.get('v');
  } else if (prefix && YOUTUBE_ID_PATH_PREFIXES.has(prefix)) {
    candidate = segments[1];
  }

  return candidate && candidate !== YOUTUBE_PLAYLIST_EMBED_ID && YOUTUBE_VIDEO_ID.test(candidate) ? candidate : null;
};

const getYoutubeStartSeconds = (parsed: URL): number | null => {
  const value = parsed.searchParams.get('start') ?? parsed.searchParams.get('t');
  if (!value) return null;
  const match = value.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
  if (!match) return null;
  const [, hours = '0', minutes = '0', seconds = '0'] = match;
  const total = Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
  return total > 0 ? total : null;
};

export type VideoEmbedSource = {
  kind: 'iframe' | 'video' | 'link';
  url: string;
  outboundUrl?: string;
};

const extractIframeSource = (value: string): string | null => {
  const match = value.match(/<iframe\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1/i);
  return match?.[2]?.replace(/&amp;/g, '&').trim() ?? null;
};

const frameOrLink = (url: string, outboundUrl?: string): VideoEmbedSource => {
  if (!isEmbedFrameOrigin(url)) return { kind: 'link', url };
  return outboundUrl ? { kind: 'iframe', url, outboundUrl } : { kind: 'iframe', url };
};

export const getVideoEmbedSource = (value: string): VideoEmbedSource | null => {
  const trimmedValue = value.trim();
  const iframeSource = extractIframeSource(trimmedValue);
  const candidate = iframeSource ?? trimmedValue;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return null;
  }

  const isYoutube = isYoutubeHostname(parsed.hostname);
  if (isYoutube) {
    const youtubeId = getYoutubeVideoId(parsed);
    if (youtubeId) {
      const playerOrigin = isHostOrSubdomain(normalizeHostname(parsed.hostname), 'youtube-nocookie.com')
        ? 'https://www.youtube-nocookie.com'
        : 'https://www.youtube.com';
      const embedUrl = new URL(`/embed/${youtubeId}`, playerOrigin);
      const startSeconds = getYoutubeStartSeconds(parsed);
      if (startSeconds) embedUrl.searchParams.set('start', String(startSeconds));
      return frameOrLink(embedUrl.toString());
    }
  }

  const isClipy = isClipyHost(parsed.hostname);
  const clipyId = clipyVideoId(parsed);
  if (clipyId) {
    return frameOrLink(
      withSerpListsClipyRef(`https://clipy.online/embed/${clipyId}${parsed.search}`),
      withSerpListsClipyRef(`https://clipy.online/video/${clipyId}`),
    );
  }

  if (iframeSource) {
    const frameUrl = new URL(parsed);
    frameUrl.protocol = 'https:';
    const source = frameOrLink(frameUrl.toString());
    return source.kind === 'iframe' ? source : { kind: 'link', url: parsed.toString() };
  }

  if (isYoutube || isClipy) {
    return { kind: 'link', url: parsed.toString() };
  }

  return { kind: 'video', url: parsed.toString() };
};

export { generateSlug } from '@/lib/utils/slug';
