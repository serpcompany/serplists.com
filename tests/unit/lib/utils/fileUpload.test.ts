import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/lib/api';
import {
  deleteUploadedAsset,
  getUploadedAssetKey,
  isUploadedAssetUrl,
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

  it('deletes app-owned uploaded assets through the shared API delete path', async () => {
    await expect(
      deleteUploadedAsset('/api/uploads/file?key=template-files/user/doc.pdf'),
    ).resolves.toBe(true);

    expect(api.deleteFromR2).toHaveBeenCalledWith('template-files/user/doc.pdf');
  });

  it('skips deletion for non-owned URLs', async () => {
    await expect(deleteUploadedAsset('https://cdn.example.com/doc.pdf')).resolves.toBe(
      false,
    );

    expect(api.deleteFromR2).not.toHaveBeenCalled();
  });
});
