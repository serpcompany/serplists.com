export interface ImageOptimizationOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  format?: 'jpeg' | 'png' | 'webp';
}

export const optimizeImage = async (
  file: File,
  options: ImageOptimizationOptions = {}
): Promise<File> => {
  const {
    maxWidth = 1920,
    maxHeight = 1080,
    quality = 0.8,
    format = 'jpeg'
  } = options;

  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('Could not get canvas context'));
      return;
    }

    // Created after the context check, so every path that creates it releases it once.
    const objectUrl = URL.createObjectURL(file);
    const releaseObjectUrl = () => URL.revokeObjectURL(objectUrl);

    img.onload = () => {
      try {
        // Calculate new dimensions
        let { width, height } = img;

        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width *= ratio;
          height *= ratio;
        }

        // Set canvas dimensions
        canvas.width = width;
        canvas.height = height;

        // Draw and compress image. The pixels are on the canvas now, so toBlob no
        // longer needs the object URL.
        ctx.drawImage(img, 0, 0, width, height);
      } catch (error) {
        // A throw inside an event handler would leave the promise pending forever.
        reject(error instanceof Error ? error : new Error('Failed to draw image'));
        return;
      } finally {
        releaseObjectUrl();
      }

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Failed to optimize image'));
            return;
          }

          // Create new file with optimized blob
          const optimizedFile = new File(
            [blob],
            file.name.replace(/\.[^/.]+$/, `.${format}`),
            {
              type: `image/${format}`,
              lastModified: Date.now()
            }
          );

          resolve(optimizedFile);
        },
        `image/${format}`,
        quality
      );
    };

    img.onerror = () => {
      releaseObjectUrl();
      reject(new Error('Failed to load image'));
    };

    img.src = objectUrl;
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
