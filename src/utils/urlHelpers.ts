import { clipyVideoId, isClipyHost, withSerpListsClipyRef } from '@/lib/utils/clipyUrl';
import { isEmbedFrameOrigin } from '@/lib/utils/embedOrigins';

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);
const YOUTUBE_SHORT_HOST = 'youtu.be';
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

const isYoutubeHost = (hostname: string): boolean =>
  hostname === YOUTUBE_SHORT_HOST || YOUTUBE_HOSTS.has(hostname);

const getYoutubeIdFromUrl = (parsed: URL): string | null => {
  let candidate: string | null | undefined;
  if (parsed.hostname === YOUTUBE_SHORT_HOST) {
    candidate = parsed.pathname.split('/')[1];
  } else if (parsed.pathname === '/watch') {
    candidate = parsed.searchParams.get('v');
  } else {
    candidate = parsed.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/]+)\/?$/)?.[1];
  }
  // /embed/videoseries?list=... is a playlist player, not an 11-character video ID.
  return candidate && candidate !== 'videoseries' && YOUTUBE_ID.test(candidate) ? candidate : null;
};

/**
 * Extracts the YouTube video ID from watch, youtu.be, embed, shorts and live URLs
 */
export const getYoutubeVideoId = (url: string): string | null => {
  try {
    const parsed = new URL(url);
    return isYoutubeHost(parsed.hostname) ? getYoutubeIdFromUrl(parsed) : null;
  } catch {
    return null;
  }
};

/** Reads a YouTube start time (`t=90`, `t=1m30s`, `start=90`) as whole seconds. */
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
  /**
   * `iframe`: a player on an origin the Content-Security-Policy frame-src allows.
   * `video`: a media file for the native player.
   * `link`: a page that cannot be framed, shown as an outbound link instead.
   */
  kind: 'iframe' | 'video' | 'link';
  url: string;
  outboundUrl?: string;
};

const extractIframeSource = (value: string): string | null => {
  const match = value.match(/<iframe\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1/i);
  return match?.[2]?.replace(/&amp;/g, '&').trim() ?? null;
};

/** Frames the URL only when its origin is allowlisted; anything else becomes a link. */
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

  const isYoutube = isYoutubeHost(parsed.hostname);
  if (isYoutube) {
    const youtubeId = getYoutubeIdFromUrl(parsed);
    if (youtubeId) {
      const playerOrigin = parsed.hostname.endsWith('youtube-nocookie.com')
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
    // upgrade-insecure-requests loads http frames over https, so check the https origin.
    const frameUrl = new URL(parsed);
    frameUrl.protocol = 'https:';
    const source = frameOrLink(frameUrl.toString());
    return source.kind === 'iframe' ? source : { kind: 'link', url: parsed.toString() };
  }

  // A YouTube or Clipy page that is not a playable video is a web page, not a media file.
  if (isYoutube || isClipy) {
    return { kind: 'link', url: parsed.toString() };
  }

  return { kind: 'video', url: parsed.toString() };
};

/**
 * Generates a URL-friendly slug from a title
 */
export const generateSlug = (title: string): string => {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single
    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
};

/**
 * Validates if a URL is a valid HTTP/HTTPS URL
 */
export const isValidUrl = (url: string): boolean => {
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
  } catch {
    return false;
  }
};
