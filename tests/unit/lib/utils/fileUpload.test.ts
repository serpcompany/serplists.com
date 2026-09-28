import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/lib/api';
import { UPLOAD_MAX_BYTES } from '@/lib/schemas/uploadLimits';
import {
  deleteUploadedAsset,
  getUploadedAssetKey,
  isUploadedAssetUrl,
  validateFile,
} from '@/lib/utils/fileUpload';

vi.mock('@/lib/api', () => ({
  api: {
    deleteFromR2: vi.fn(),
    uploadToR2: vi.fn(),
  },
}));

vi.mock('@/lib/imageOptimization', () => ({
  isImageFile: vi.fn(() => false),
  optimizeImage: vi.fn(async (file: File) => file),
}));

describe('uploaded asset deletion helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('extracts app-owned upload keys from relative and absolute upload URLs', () => {
    expect(
      getUploadedAssetKey('/api/uploads/file?key=template-images/user/image.png'),
    ).toBe('template-images/user/image.png');

    expect(
      getUploadedAssetKey(
        'https://serplists.com/api/uploads/file?key=avatars/user/avatar.png',
      ),
    ).toBe('avatars/user/avatar.png');
  });

  it('does not treat external URLs or URLs without keys as deletable app uploads', () => {
    expect(isUploadedAssetUrl('https://example.com/image.png')).toBe(false);
    expect(isUploadedAssetUrl('/api/uploads/file')).toBe(false);
    expect(getUploadedAssetKey('not a url')).toBeNull();
  });

  it('deletes an uploaded avatar through the shared API delete path', async () => {
    await expect(
      deleteUploadedAsset('/api/uploads/file?key=avatars/user/avatar.png'),
    ).resolves.toBe(true);

    expect(api.deleteFromR2).toHaveBeenCalledWith('avatars/user/avatar.png');
  });

  // Templates, versions, Runs and clones may still reference template media, so
  // clearing or replacing it only unlinks it; the API refuses the delete anyway.
  it.each([
    'template-files/user/doc.pdf',
    'template-images/user/image.png',
    'template-videos/user/video.mp4',
  ])('never deletes template media (%s)', async (key) => {
    await expect(deleteUploadedAsset(`/api/uploads/file?key=${key}`)).resolves.toBe(false);

    expect(api.deleteFromR2).not.toHaveBeenCalled();
  });

  it('skips deletion for non-owned URLs', async () => {
    await expect(deleteUploadedAsset('https://cdn.example.com/doc.pdf')).resolves.toBe(
      false,
    );

    expect(api.deleteFromR2).not.toHaveBeenCalled();
  });
});

describe('validateFile', () => {
  it.each([
    ['image', 'template-images', 'image/png'],
    ['video', 'template-videos', 'video/mp4'],
    ['file', 'template-files', 'application/pdf'],
  ] as const)('checks %s files against the limit the API enforces for %s', (type, bucket, mime) => {
    const limit = UPLOAD_MAX_BYTES[bucket];
    const fileOfSize = (size: number) => ({ size, type: mime }) as File;

    expect(validateFile(fileOfSize(limit), type)).toEqual({ valid: true });
    expect(validateFile(fileOfSize(limit + 1), type)).toEqual({
      valid: false,
      error: 'File size must be less than 50MB',
    });
  });
});
