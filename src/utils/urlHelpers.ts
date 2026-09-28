import { clipyVideoId, isClipyHost, withSerpListsClipyRef } from '@/lib/utils/clipyUrl';
import { isEmbedFrameOrigin } from '@/lib/utils/embedOrigins';

const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
// Path prefixes followed by the video id: /embed/ID, /shorts/ID, /live/ID and the legacy /v/ID, /e/ID.
const YOUTUBE_ID_PATH_PREFIXES = new Set(['embed', 'shorts', 'live', 'v', 'e']);

const normalizeHostname = (hostname: string) => hostname.toLowerCase().replace(/\.$/, '');

const isHostOrSubdomain = (hostname: string, domain: string) =>
  hostname === domain || hostname.endsWith(`.${domain}`);

/** youtu.be, youtube.com and its subdomains (www, m, music), and youtube-nocookie.com. */
export const isYoutubeHostname = (hostname: string): boolean => {
  const host = normalizeHostname(hostname);
  return (
    host === 'youtu.be' ||
    isHostOrSubdomain(host, 'youtube.com') ||
    isHostOrSubdomain(host, 'youtube-nocookie.com')
  );
};

/**
 * The video id of a YouTube watch, share, Shorts, live or embed URL, or null when the URL
 * is not a YouTube video (a channel, a playlist, another host).
 */
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

  // "videoseries" (a playlist embed) happens to be 11 characters long.
  return candidate && candidate !== 'videoseries' && YOUTUBE_VIDEO_ID.test(candidate) ? candidate : null;
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

  // A YouTube page is never a playable file: embed the video, or link to a page that has none.
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

// Generates a URL-friendly slug from a title, with the same rule as the API and sitemap.
export { generateSlug } from '@/lib/utils/slug';

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
