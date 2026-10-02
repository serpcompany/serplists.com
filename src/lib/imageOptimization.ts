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

const KEEP_ORIGINAL_MAX_BYTES = 1024 * 1024;

const REENCODED_IN_OWN_FORMAT: Record<string, EncodedImageType> = {
  'image/png': 'image/png',
  'image/jpeg': 'image/jpeg',
  'image/webp': 'image/webp',
};

const EXTENSION_BY_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpeg',
  'image/webp': 'webp',
};

export const planImageUpload = (
  source: { type: string; size: number; width: number; height: number },
  limits: { maxWidth: number; maxHeight: number },
): ImageUploadPlan => {
  if (source.type === 'image/gif') {
    return { action: 'keep' };
  }

  const scale = Math.min(1, limits.maxWidth / source.width, limits.maxHeight / source.height);
  const resized = scale < 1;
  const sameFormat = REENCODED_IN_OWN_FORMAT[source.type];

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

const canvasOfSize = (width: number, height: number) => {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Could not get canvas context');
  }
  canvas.width = width;
  canvas.height = height;
  return { canvas, context };
};

const loadSizedImage = async (file: File) => {
  const img = await loadImage(file);
  if (!img.naturalWidth || !img.naturalHeight) {
    throw new Error('Image has no size');
  }
  return { img, width: img.naturalWidth, height: img.naturalHeight };
};

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

export const optimizeImage = async (
  file: File,
  options: ImageOptimizationOptions = {},
): Promise<File> => {
  const { maxWidth = 1920, maxHeight = 1080, quality = 0.8 } = options;

  if (file.type === 'image/gif') {
    return file;
  }

  const { img, width, height } = await loadSizedImage(file);

  const plan = planImageUpload(
    { type: file.type, size: file.size, width, height },
    { maxWidth, maxHeight },
  );
  if (plan.action === 'keep') {
    return file;
  }

  const { canvas, context } = canvasOfSize(plan.width, plan.height);
  context.drawImage(img, 0, 0, plan.width, plan.height);

  const blob = await encodeCanvas(canvas, plan.mimeType, quality);
  if (!plan.resized && REENCODED_IN_OWN_FORMAT[file.type] && blob.size >= file.size) {
    return file;
  }

  const encodedType = blob.type || plan.mimeType;
  return new File([blob], renameForType(file.name, file.type, encodedType), {
    type: encodedType,
    lastModified: Date.now(),
  });
};

export const AVATAR_MAX_PIXELS = 512;
const AVATAR_TYPE: EncodedImageType = 'image/webp';
const AVATAR_QUALITY = 0.85;

export type AvatarImagePlan = {
  crop: { x: number; y: number; size: number };
  size: number;
  mimeType: EncodedImageType;
};

export const planAvatarImage = (source: { width: number; height: number }): AvatarImagePlan => {
  const side = Math.min(source.width, source.height);
  return {
    crop: { x: Math.floor((source.width - side) / 2), y: Math.floor((source.height - side) / 2), size: side },
    size: Math.max(1, Math.min(AVATAR_MAX_PIXELS, side)),
    mimeType: AVATAR_TYPE,
  };
};

export const prepareAvatarImage = async (file: File): Promise<File> => {
  const { img, width, height } = await loadSizedImage(file);
  const plan = planAvatarImage({ width, height });
  const { canvas, context } = canvasOfSize(plan.size, plan.size);
  context.drawImage(img, plan.crop.x, plan.crop.y, plan.crop.size, plan.crop.size, 0, 0, plan.size, plan.size);

  const blob = await encodeCanvas(canvas, plan.mimeType, AVATAR_QUALITY);
  const encodedType = blob.type || plan.mimeType;
  return new File([blob], renameForType('avatar', '', encodedType), { type: encodedType, lastModified: Date.now() });
};

export const isImageFile = (file: File): boolean => {
  return file.type.startsWith('image/');
};
