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
