export const EMBED_FRAME_ORIGINS = [
  'https://www.youtube.com',
  'https://www.youtube-nocookie.com',
  'https://clipy.online',
] as const;

const embedFrameOrigins: ReadonlySet<string> = new Set(EMBED_FRAME_ORIGINS);

export const isEmbedFrameOrigin = (url: string): boolean => {
  try {
    return embedFrameOrigins.has(new URL(url).origin);
  } catch {
    return false;
  }
};
