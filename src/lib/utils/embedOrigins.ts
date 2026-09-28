/**
 * Origins that video blocks may load in an iframe.
 *
 * The production Content-Security-Policy in public/_headers must list every one
 * of these in its frame-src directive, or the browser refuses the frame. Keep the
 * two in sync: tests/unit/security/headers.test.ts fails when they drift.
 */
export const EMBED_FRAME_ORIGINS = [
  'https://www.youtube.com',
  'https://www.youtube-nocookie.com',
  'https://clipy.online',
] as const;

const embedFrameOrigins: ReadonlySet<string> = new Set(EMBED_FRAME_ORIGINS);

/**
 * True when the URL's exact origin is allowed to be framed. Compares parsed
 * origins, never substrings, so a lookalike host such as
 * www.youtube.com.evil.test does not match.
 */
export const isEmbedFrameOrigin = (url: string): boolean => {
  try {
    return embedFrameOrigins.has(new URL(url).origin);
  } catch {
    return false;
  }
};
