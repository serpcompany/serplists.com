// Supabase removed - using Cloudflare API
import { optimizeImage, isImageFile } from "@/lib/imageOptimization";

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

    // Create a unique filename with user folder structure
    const fileExt = fileToUpload.name.split('.').pop();
    const fileName = `${userId}/${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;

    // TODO: Replace with Cloudflare R2 storage
    console.log('File upload disabled - needs Cloudflare R2 implementation');
    return { 
      success: false, 
      error: 'File upload is temporarily disabled while we migrate to Cloudflare R2' 
    };
    
    // Future implementation:
    // const url = await api.uploadFile(fileToUpload, bucket, fileName);
    // return {
    //   success: true,
    //   url,
    //   fileName: file.name,
    //   fileSize: file.size
    // };
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
    // Extract the file path from the URL
    const urlParts = url.split('/');
    const fileName = urlParts[urlParts.length - 1];
    const userFolder = urlParts[urlParts.length - 2];
    const filePath = `${userFolder}/${fileName}`;

    // TODO: Replace with Cloudflare R2 storage
    console.log('File delete disabled - needs Cloudflare R2 implementation');
    return false;
    
    // Future implementation:
    // return await api.deleteFile(filePath, bucket);
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