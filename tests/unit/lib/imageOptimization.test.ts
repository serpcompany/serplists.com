import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { optimizeImage, planImageUpload } from '@/lib/imageOptimization';

const LIMITS = { maxWidth: 1920, maxHeight: 1080 };
const MB = 1024 * 1024;

describe('planImageUpload', () => {
  it.each([
    ['an animated GIF', 'image/gif', 4000, 3000, 5 * MB, { action: 'keep' }],
    ['a small PNG within the limits', 'image/png', 800, 600, 200_000, { action: 'keep' }],
    ['a small JPEG within the limits', 'image/jpeg', 800, 600, 200_000, { action: 'keep' }],
    ['an oversized PNG', 'image/png', 4000, 3000, 5 * MB, { action: 'encode', mimeType: 'image/png' }],
    ['an oversized WebP', 'image/webp', 4000, 3000, 5 * MB, { action: 'encode', mimeType: 'image/webp' }],
    ['an oversized JPEG', 'image/jpeg', 4000, 3000, 5 * MB, { action: 'encode', mimeType: 'image/jpeg' }],
    ['a heavy JPEG within the limits', 'image/jpeg', 1600, 900, 4 * MB, { action: 'encode', mimeType: 'image/jpeg' }],
    ['an SVG', 'image/svg+xml', 300, 150, 2_000, { action: 'encode', mimeType: 'image/png' }],
    ['an AVIF', 'image/avif', 800, 600, 100_000, { action: 'encode', mimeType: 'image/png' }],
    ['a BMP', 'image/bmp', 800, 600, 1_500_000, { action: 'encode', mimeType: 'image/png' }],
  ])('plans %s', (_label, type, width, height, size, expected) => {
    expect(planImageUpload({ type, size, width, height }, LIMITS)).toMatchObject(expected);
  });

  it('never plans a JPEG for a source that can carry transparency', () => {
    for (const type of ['image/png', 'image/webp', 'image/svg+xml', 'image/avif', 'image/gif']) {
      const plan = planImageUpload({ type, size: 9 * MB, width: 5000, height: 5000 }, LIMITS);
      expect(plan).not.toMatchObject({ mimeType: 'image/jpeg' });
    }
  });

  it('scales an oversized image to fit the limits with whole-pixel sizes', () => {
    expect(
      planImageUpload({ type: 'image/png', size: 5 * MB, width: 3001, height: 2001 }, LIMITS),
    ).toEqual({ action: 'encode', mimeType: 'image/png', width: 1620, height: 1080, resized: true });
  });
});

type FakeImageInstance = {
  naturalWidth: number;
  naturalHeight: number;
  onload: (() => void) | null;
  onerror: (() => void) | null;
};

describe('optimizeImage', () => {
  let imageSize = { width: 4000, height: 3000 };
  let loadFails = false;
  let blobType: string | null = null;
  let blobBytes = 10;
  const toBlob = vi.fn();
  const drawImage = vi.fn();
  const createdImages: FakeImageInstance[] = [];

  beforeEach(() => {
    imageSize = { width: 4000, height: 3000 };
    loadFails = false;
    blobType = null;
    blobBytes = 10;
    createdImages.length = 0;
    toBlob.mockReset();
    drawImage.mockReset();
    toBlob.mockImplementation((callback: (blob: Blob | null) => void, type: string) => {
      callback(new Blob([new Uint8Array(blobBytes)], { type: blobType ?? type }));
    });

    class FakeImage implements FakeImageInstance {
      naturalWidth = 0;
      naturalHeight = 0;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor() {
        createdImages.push(this);
      }
      set src(_value: string) {
        queueMicrotask(() => {
          if (loadFails) {
            this.onerror?.();
            return;
          }
          this.naturalWidth = imageSize.width;
          this.naturalHeight = imageSize.height;
          this.onload?.();
        });
      }
    }

    vi.stubGlobal('Image', FakeImage);
    vi.stubGlobal('document', {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => ({ drawImage }),
        toBlob,
      }),
    });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:source');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const file = (name: string, type: string, size = 5 * MB) =>
    new File([new Uint8Array(size)], name, { type });

  it('keeps a PNG as PNG, so transparent pixels stay transparent', async () => {
    const result = await optimizeImage(file('logo.png', 'image/png'));

    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png', expect.any(Number));
    expect(result.type).toBe('image/png');
    expect(result.name).toBe('logo.png');
  });

  it('uploads a GIF untouched, so its animation is kept', async () => {
    const gif = file('steps.gif', 'image/gif');

    await expect(optimizeImage(gif)).resolves.toBe(gif);
    expect(createdImages).toHaveLength(0);
  });

  it('keeps the original when the re-encoded file is not smaller and no resize was needed', async () => {
    imageSize = { width: 1600, height: 900 };
    blobBytes = 5 * MB + 1;
    const jpeg = file('photo.jpg', 'image/jpeg');

    await expect(optimizeImage(jpeg)).resolves.toBe(jpeg);
  });

  it('names and types the file from the bytes the browser produced', async () => {
    blobType = 'image/png'; // a browser without WebP encoding falls back to PNG
    const result = await optimizeImage(file('photo.webp', 'image/webp'));

    expect(result.type).toBe('image/png');
    expect(result.name).toBe('photo.png');
  });

  it('keeps the file name when a resized image keeps its type', async () => {
    const result = await optimizeImage(file('photo.jpg', 'image/jpeg'));

    expect(result.type).toBe('image/jpeg');
    expect(result.name).toBe('photo.jpg');
  });

  it('adds an extension when a converted file has none', async () => {
    const result = await optimizeImage(file('diagram', 'image/avif', 100_000));

    expect(result.name).toBe('diagram.png');
    expect(result.type).toBe('image/png');
  });

  it('releases the object URL after the image loads and after it fails', async () => {
    await optimizeImage(file('logo.png', 'image/png'));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:source');

    vi.mocked(URL.revokeObjectURL).mockClear();
    loadFails = true;
    await expect(optimizeImage(file('broken.png', 'image/png'))).rejects.toThrow('Failed to load image');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:source');
  });

  it('rejects an image with no size instead of drawing an empty canvas', async () => {
    imageSize = { width: 0, height: 0 };

    await expect(optimizeImage(file('icon.svg', 'image/svg+xml', 2_000))).rejects.toThrow(
      'has no size',
    );
    expect(toBlob).not.toHaveBeenCalled();
  });
});
