import { withSerpListsClipyRef } from '@/lib/utils/clipyUrl';

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

export type VideoEmbedSource = {
  kind: 'iframe' | 'video';
  url: string;
  outboundUrl?: string;
};

const extractIframeSource = (value: string): string | null => {
  const match = value.match(/<iframe\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1/i);
  return match?.[2]?.replace(/&amp;/g, '&').trim() ?? null;
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

  if (isYoutubeHostname(parsed.hostname)) {
    // A YouTube page is never a playable file: embed the video or report the link as invalid.
    const youtubeId = getYoutubeVideoId(parsed);
    return youtubeId ? { kind: 'iframe', url: `https://www.youtube.com/embed/${youtubeId}` } : null;
  }

  const isClipyHost =
    parsed.hostname === 'clipy.online' || parsed.hostname === 'www.clipy.online';
  if (isClipyHost) {
    const clipyMatch = parsed.pathname.match(/^\/(?:video|embed)\/([a-zA-Z0-9_-]+)\/?$/);
    if (clipyMatch?.[1]) {
      return {
        kind: 'iframe',
        url: withSerpListsClipyRef(
          `https://clipy.online/embed/${clipyMatch[1]}${parsed.search}`,
        ),
        outboundUrl: withSerpListsClipyRef(
          `https://clipy.online/video/${clipyMatch[1]}`,
        ),
      };
    }
  }

  return { kind: iframeSource ? 'iframe' : 'video', url: parsed.toString() };
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
