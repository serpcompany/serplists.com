export interface ImageOptimizationOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
}

type EncodedImageType = 'image/png' | 'image/jpeg' | 'image/webp';

export type ImageUploadPlan =
  | { action: 'keep' }
  | {
      action: 'encode';
      mimeType: EncodedImageType;
      width: number;
      height: number;
      resized: boolean;
    };

// An image within the limits and under this size is uploaded as it is.
const KEEP_ORIGINAL_MAX_BYTES = 1024 * 1024;

// Types the template-images bucket stores, re-encoded in their own format so PNG and
// WebP keep their transparency. GIF is never drawn to a canvas: that keeps one frame.
const SAME_FORMAT: Record<string, EncodedImageType> = {
  'image/png': 'image/png',
  'image/jpeg': 'image/jpeg',
  'image/webp': 'image/webp',
};

const EXTENSION_BY_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpeg',
  'image/webp': 'webp',
};

// Decides how an image is uploaded. Other decodable types (SVG, AVIF, BMP, HEIC where
// the browser reads it) become PNG, which keeps any transparency; never JPEG, which
// would turn transparent pixels black.
export const planImageUpload = (
  source: { type: string; size: number; width: number; height: number },
  limits: { maxWidth: number; maxHeight: number },
): ImageUploadPlan => {
  if (source.type === 'image/gif') {
    return { action: 'keep' };
  }

  const scale = Math.min(1, limits.maxWidth / source.width, limits.maxHeight / source.height);
  const resized = scale < 1;
  const sameFormat = SAME_FORMAT[source.type];

  if (sameFormat && !resized && source.size <= KEEP_ORIGINAL_MAX_BYTES) {
    return { action: 'keep' };
  }

  return {
    action: 'encode',
    mimeType: sameFormat ?? 'image/png',
    width: Math.max(1, Math.round(source.width * scale)),
    height: Math.max(1, Math.round(source.height * scale)),
    resized,
  };
};

const renameForType = (name: string, sourceType: string, type: string): string => {
  const extension = EXTENSION_BY_TYPE[type];
  const hasExtension = /\.[^/.]+$/.test(name);
  if (!extension || (type === sourceType && hasExtension)) {
    return name;
  }

  const base = name.replace(/\.[^/.]+$/, '');
  return `${base || 'image'}.${extension}`;
};

const loadImage = (file: File): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    const src = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(src);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(src);
      reject(new Error('Failed to load image'));
    };
    img.src = src;
  });

const encodeCanvas = (
  canvas: HTMLCanvasElement,
  type: EncodedImageType,
  quality: number,
): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Failed to optimize image'))),
      type,
      quality,
    );
  });

// Shrinks an image for a template Image block without changing what it shows. Returns
// the original file when re-encoding would not help.
export const optimizeImage = async (
  file: File,
  options: ImageOptimizationOptions = {},
): Promise<File> => {
  const { maxWidth = 1920, maxHeight = 1080, quality = 0.8 } = options;

  if (file.type === 'image/gif') {
    return file;
  }

  const img = await loadImage(file);
  const width = img.naturalWidth;
  const height = img.naturalHeight;
  if (!width || !height) {
    throw new Error('Image has no size');
  }

  const plan = planImageUpload(
    { type: file.type, size: file.size, width, height },
    { maxWidth, maxHeight },
  );
  if (plan.action === 'keep') {
    return file;
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not get canvas context');
  }

  canvas.width = plan.width;
  canvas.height = plan.height;
  ctx.drawImage(img, 0, 0, plan.width, plan.height);

  const blob = await encodeCanvas(canvas, plan.mimeType, quality);
  if (!plan.resized && SAME_FORMAT[file.type] && blob.size >= file.size) {
    return file;
  }

  // A browser that cannot encode the requested type returns PNG; name and type the
  // file after the bytes it actually holds.
  const type = blob.type || plan.mimeType;
  return new File([blob], renameForType(file.name, file.type, type), {
    type,
    lastModified: Date.now(),
  });
};

export const isImageFile = (file: File): boolean => {
  return file.type.startsWith('image/');
};

export const getImageDimensions = (file: File): Promise<{ width: number; height: number }> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({ width: img.width, height: img.height });
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image'));
    };

    img.src = objectUrl;
  });
};
