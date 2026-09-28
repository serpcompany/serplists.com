import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getImageDimensions, optimizeImage } from '@/lib/imageOptimization';

// optimizeImage used to create an object URL for every uploaded image and never revoke it,
// so each file stayed referenced until the tab closed. It also left the promise pending
// forever when drawing threw, so uploadFile never fell back to the original file.

type ImageOutcome = 'load' | 'error';

let imageOutcome: ImageOutcome = 'load';
let drawImage = vi.fn();
let toBlobResult: Blob | null = new Blob(['optimized']);
let hasContext = true;

class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  width = 4000;
  height = 3000;
  private source = '';

  get src() {
    return this.source;
  }

  set src(value: string) {
    this.source = value;
    queueMicrotask(() => (imageOutcome === 'load' ? this.onload?.() : this.onerror?.()));
  }
}

const fakeCanvas = () => ({
  getContext: () => (hasContext ? { drawImage } : null),
  height: 0,
  toBlob: (callback: (blob: Blob | null) => void) => queueMicrotask(() => callback(toBlobResult)),
  width: 0,
});

const settleWithin = <T>(promise: Promise<T>, ms = 200): Promise<T> =>
  Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('still pending')), ms)),
  ]);

const photo = () => new File(['raw-bytes'], 'photo.png', { type: 'image/png' });

let createObjectURL: ReturnType<typeof vi.spyOn>;
let revokeObjectURL: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  imageOutcome = 'load';
  drawImage = vi.fn();
  toBlobResult = new Blob(['optimized']);
  hasContext = true;
  vi.stubGlobal('Image', FakeImage);
  vi.stubGlobal('document', { createElement: () => fakeCanvas() });
  createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-1');
  revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('optimizeImage', () => {
  it('releases the object URL once the image is drawn', async () => {
    const optimized = await settleWithin(optimizeImage(photo()));

    expect(optimized.type).toBe('image/jpeg');
    expect(optimized.name).toBe('photo.jpeg');
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test-1');
  });

  it('releases the object URL when the image cannot be decoded', async () => {
    imageOutcome = 'error';

    await expect(settleWithin(optimizeImage(photo()))).rejects.toThrow('Failed to load image');
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test-1');
  });

  it('releases the object URL when the canvas yields no blob', async () => {
    toBlobResult = null;

    await expect(settleWithin(optimizeImage(photo()))).rejects.toThrow('Failed to optimize image');
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test-1');
  });

  it('rejects instead of hanging when drawing throws, and still releases the URL', async () => {
    drawImage = vi.fn(() => {
      throw new Error('InvalidStateError');
    });

    await expect(settleWithin(optimizeImage(photo()))).rejects.toThrow('InvalidStateError');
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test-1');
  });

  it('creates no object URL when there is no canvas context', async () => {
    hasContext = false;

    await expect(settleWithin(optimizeImage(photo()))).rejects.toThrow('Could not get canvas context');
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });
});

describe('getImageDimensions', () => {
  it('releases the object URL after reading the size', async () => {
    await expect(settleWithin(getImageDimensions(photo()))).resolves.toEqual({ height: 3000, width: 4000 });
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test-1');
  });

  it('releases the object URL when the image cannot be decoded', async () => {
    imageOutcome = 'error';

    await expect(settleWithin(getImageDimensions(photo()))).rejects.toThrow('Failed to load image');
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test-1');
  });
});
