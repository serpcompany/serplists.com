import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/lib/api';
import { optimizeImage } from '@/lib/imageOptimization';
import { uploadFile, validateFile } from '@/lib/utils/fileUpload';

vi.mock('@/lib/api', () => ({
  api: {
    uploadToR2: vi.fn(),
  },
}));

vi.mock('@/lib/imageOptimization', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/imageOptimization')>()),
  optimizeImage: vi.fn(),
}));

describe('uploadFile image handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.uploadToR2).mockResolvedValue({ url: '/api/uploads/file?key=k' });
  });

  it('uploads an image attached to a File block as the original bytes', async () => {
    const png = new File([new Uint8Array(10)], 'screenshot.png', { type: 'image/png' });

    await uploadFile(png, 'template-files');

    expect(optimizeImage).not.toHaveBeenCalled();
    expect(api.uploadToR2).toHaveBeenCalledWith({ bucket: 'template-files', file: png });
  });

  it('uploads what the optimizer returns for an Image block and reports its name', async () => {
    const original = new File([new Uint8Array(10)], 'logo.avif', { type: 'image/avif' });
    const converted = new File([new Uint8Array(5)], 'logo.png', { type: 'image/png' });
    vi.mocked(optimizeImage).mockResolvedValue(converted);

    const result = await uploadFile(original, 'template-images');

    expect(api.uploadToR2).toHaveBeenCalledWith({ bucket: 'template-images', file: converted });
    expect(result).toMatchObject({ success: true, fileName: 'logo.png', fileSize: 5 });
  });

  it('uploads the original when the optimizer fails', async () => {
    const png = new File([new Uint8Array(10)], 'logo.png', { type: 'image/png' });
    vi.mocked(optimizeImage).mockRejectedValue(new Error('Failed to load image'));

    await uploadFile(png, 'template-images');

    expect(api.uploadToR2).toHaveBeenCalledWith({ bucket: 'template-images', file: png });
  });
});

describe('upload type checks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ['file', 'report.zip', 'application/x-zip-compressed', true],
    ['file', 'data.csv', 'application/vnd.ms-excel', true],
    ['file', 'notes.md', '', true],
    ['file', 'page.html', 'text/html', false],
    ['video', 'clip.mp4', 'video/mp4', true],
    ['video', 'movie.mkv', 'video/x-matroska', false],
    // Image blocks convert other decodable images before upload.
    ['image', 'photo.avif', 'image/avif', true],
    ['image', 'notes.txt', 'text/plain', false],
  ] as const)('validates a %s block file %s (%s)', (type, name, mime, valid) => {
    expect(validateFile(new File(['x'], name, { type: mime }), type).valid).toBe(valid);
  });

  it('refuses an image the browser could not convert, before calling the API', async () => {
    const heic = new File([new Uint8Array(10)], 'photo.heic', { type: 'image/heic' });
    vi.mocked(optimizeImage).mockRejectedValue(new Error('Failed to load image'));

    const result = await uploadFile(heic, 'template-images');

    expect(api.uploadToR2).not.toHaveBeenCalled();
    expect(result).toEqual({
      success: false,
      error: "This file type can't be uploaded here. Use PNG, JPEG, WebP, or GIF images.",
    });
  });
});
