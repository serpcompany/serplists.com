// Where an image, video, or file block's value comes from, and whether its file name
// and size still describe it. Framework-free: the editor form, the upload field, and
// the renderers share it.

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

// What an image block's preview loads, or null when the value cannot show an image
// yet. The renderers load http(s) URLs and paths on this site (safeUrl); anything else,
// such as a half-typed 'h' or 'https:', would load a page of this site as the image and
// always fail.
export const imagePreviewSrc = (value: string): string | null => {
  const trimmed = value.trim();
  if (trimmed.startsWith('/')) {
    // Uploads (/api/uploads/file?key=...) and other paths on this site.
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
  fileName?: string;
  fileSize?: number;
  uploadType?: MediaSourceType;
};

export const mediaSourceTypeFor = (value: string): MediaSourceType | undefined => {
  if (!value.trim()) {
    return undefined;
  }
  return isUploadedAssetUrl(value) ? 'upload' : 'url';
};

// fileName and fileSize describe the file the value points to: an uploaded file, or a
// linked file its author named (uploadType "url", as the public packs do). Next to any
// other value they are left over from an upload the value no longer points to.
export const hasCurrentFileInfo = (content: { value?: unknown; uploadType?: unknown }): boolean =>
  typeof content.value === 'string' &&
  (isUploadedAssetUrl(content.value) || content.uploadType === 'url');

const MEDIA_TYPES: ReadonlySet<string> = new Set(['image', 'video', 'file']);

// Import: the portable format lists uploadType and fileName as independent fields, so
// a hand-written or third-party pack can name a linked file without uploadType. Once
// stored, that could not be told apart from a name left over from an upload, so
// import states the link here and hasCurrentFileInfo keeps the name. Uploads, a
// stated uploadType, unnamed links and other block types are unchanged.
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

// Typing in a media block's URL field. The name and size described the file the old
// value pointed to, so a new value drops them (the upload itself is not deleted: the
// saved template may still use it). An unchanged value keeps everything.
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
