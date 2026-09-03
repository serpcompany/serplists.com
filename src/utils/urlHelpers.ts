import { withSerpListsClipyRef } from '@/lib/utils/clipyUrl';

/**
 * Extracts YouTube video ID from various YouTube URL formats
 */
export const getYoutubeVideoId = (url: string): string | null => {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
};

export type VideoEmbedSource = {
  kind: 'iframe' | 'video';
  url: string;
  outboundUrl?: string;
};

const extractIframeSource = (value: string): string | null => {
  const match = value.match(/<iframe\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1/i);
  return match?.[2]?.replaceAll('&amp;', '&').trim() ?? null;
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

  const isYoutubeHost =
    parsed.hostname === 'youtu.be' ||
    parsed.hostname === 'youtube.com' ||
    parsed.hostname === 'www.youtube.com';
  if (isYoutubeHost) {
    const youtubeId = getYoutubeVideoId(candidate);
    if (youtubeId) {
      return { kind: 'iframe', url: `https://www.youtube.com/embed/${youtubeId}` };
    }
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
