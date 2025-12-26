// Supabase removed - using Cloudflare API
import { optimizeImage, isImageFile } from "@/lib/imageOptimization";
import { api } from "@/lib/api";

export type UploadResult = {
  success: boolean;
  url?: string;
  error?: string;
  fileName?: string;
  fileSize?: number;
};

export const uploadFile = async (
  file: File,
  bucket: 'template-images' | 'template-videos' | 'template-files',
  userId: string
): Promise<UploadResult> => {
  try {
    let fileToUpload = file;
    
    // Optimize images before upload
    if (isImageFile(file)) {
      try {
        fileToUpload = await optimizeImage(file, {
          maxWidth: 1920,
          maxHeight: 1080,
          quality: 0.8
        });
        console.log('Image optimized:', { 
          original: file.size, 
          optimized: fileToUpload.size, 
          savings: Math.round((1 - fileToUpload.size / file.size) * 100) + '%' 
        });
      } catch (optimizationError) {
        console.warn('Image optimization failed, uploading original:', optimizationError);
        // Continue with original file if optimization fails
      }
    }

    // API handles key naming; userId is kept for callsite compatibility.
    void userId;

    const result = await api.uploadToR2({ bucket, file: fileToUpload });

    return {
      success: true,
      url: result.url,
      fileName: result.fileName || file.name,
      fileSize: result.fileSize || file.size,
    };
  } catch (error) {
    console.error('Upload error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Upload failed' 
    };
  }
};

export const deleteFile = async (
  url: string,
  bucket: 'template-images' | 'template-videos' | 'template-files'
): Promise<boolean> => {
  try {
    void bucket;
    const parsed = new URL(url, window.location.origin);
    const key = parsed.searchParams.get('key');
    if (!key) return false;
    await api.deleteFromR2(key);
    return true;
  } catch (error) {
    console.error('Delete error:', error);
    return false;
  }
};

export const validateFile = (
  file: File,
  type: 'image' | 'video' | 'file'
): { valid: boolean; error?: string } => {
  const maxSize = 50 * 1024 * 1024; // 50MB

  if (file.size > maxSize) {
    return { valid: false, error: 'File size must be less than 50MB' };
  }

  switch (type) {
    case 'image':
      if (!file.type.startsWith('image/')) {
        return { valid: false, error: 'Please select an image file' };
      }
      break;
    case 'video':
      if (!file.type.startsWith('video/')) {
        return { valid: false, error: 'Please select a video file' };
      }
      break;
    case 'file':
      // Allow any file type for general file uploads
      break;
  }

  return { valid: true };
};
