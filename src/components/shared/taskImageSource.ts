import { safeImageUrl } from '@/lib/utils/safeUrl';

export const resolveTaskImageSource = (url: string, failedSrc: string | null): string | null => {
  const src = safeImageUrl(url);
  return src && src !== failedSrc ? src : null;
};
