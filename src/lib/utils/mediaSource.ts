export const getUploadedAssetKey = (url: string): string | null => {
  try {
    const parsed = new URL(url, 'https://serplists.local');
    const isUploadEndpoint =
      parsed.pathname === '/api/uploads/file' ||
      parsed.pathname === '/uploads/file';
    const key = parsed.searchParams.get('key')?.trim();

    return isUploadEndpoint && key ? key : null;
  } catch {
    return null;
  }
};

export const isUploadedAssetUrl = (url: string): boolean =>
  getUploadedAssetKey(url) !== null;

export const imagePreviewSrc = (value: string): string | null => {
  const trimmed = value.trim();
  if (trimmed.startsWith('/')) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname
      ? trimmed
      : null;
  } catch {
    return null;
  }
};

export type MediaSourceType = 'upload' | 'url';

type MediaSource = {
  value: string;
  fileName?: string | undefined;
  fileSize?: number | undefined;
  uploadType?: MediaSourceType | undefined;
};

export const mediaSourceTypeFor = (value: string): MediaSourceType | undefined => {
  if (!value.trim()) {
    return undefined;
  }
  return isUploadedAssetUrl(value) ? 'upload' : 'url';
};

export const hasCurrentFileInfo = (content: { value?: unknown; uploadType?: unknown }): boolean =>
  typeof content.value === 'string' &&
  (isUploadedAssetUrl(content.value) || content.uploadType === 'url');

const MEDIA_TYPES: ReadonlySet<string> = new Set(['image', 'video', 'file']);

export function withImportedLinkSource<T extends MediaSource & { type: string }>(content: T): T {
  if (
    content.uploadType !== undefined ||
    !MEDIA_TYPES.has(content.type) ||
    typeof content.fileName !== 'string' ||
    !content.fileName.trim() ||
    typeof content.value !== 'string' ||
    !content.value.trim() ||
    isUploadedAssetUrl(content.value)
  ) {
    return content;
  }

  return { ...content, uploadType: 'url' };
}

export function withMediaValue<T extends MediaSource>(content: T, value: string): T {
  if (value === content.value) {
    return content;
  }

  return {
    ...content,
    value,
    fileName: undefined,
    fileSize: undefined,
    uploadType: mediaSourceTypeFor(value),
  };
}
