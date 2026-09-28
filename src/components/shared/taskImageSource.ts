import { safeImageUrl } from '@/lib/utils/safeUrl';

// Returns the src to load, or null when the url is unsafe or already failed. The
// failure is remembered per url, so a different image in the same block loads again.
export const resolveTaskImageSource = (url: string, failedSrc: string | null): string | null => {
  const src = safeImageUrl(url);
  return src && src !== failedSrc ? src : null;
};
