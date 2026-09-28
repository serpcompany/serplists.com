import { toast } from 'sonner';

import {
  deleteUploadedAsset,
  uploadFile,
  validateFile,
  type TemplateUploadBucket,
} from '@/lib/utils/fileUpload';

export type FileUploadType = 'image' | 'video' | 'file';

const BUCKET_BY_TYPE: Record<FileUploadType, TemplateUploadBucket> = {
  image: 'template-images',
  video: 'template-videos',
  file: 'template-files',
};

export type UploadedFileInfo = { url: string; fileName?: string; fileSize?: number };

// Feedback goes through sonner, the only toast renderer the app mounts (App.tsx), so a
// rejected upload always tells the user why.
export const uploadSelectedFile = async ({
  file,
  type,
  userId,
  previousValue,
  onUploaded,
}: {
  file: File;
  type: FileUploadType;
  userId: string;
  previousValue: string;
  onUploaded: (info: UploadedFileInfo) => void;
}): Promise<boolean> => {
  const validation = validateFile(file, type);
  if (!validation.valid) {
    toast.error('Invalid file', { description: validation.error });
    return false;
  }

  try {
    const result = await uploadFile(file, BUCKET_BY_TYPE[type], userId);
    if (!result.success || !result.url) {
      toast.error('Upload failed', { description: result.error || 'Unknown error occurred' });
      return false;
    }

    onUploaded({ url: result.url, fileName: result.fileName, fileSize: result.fileSize });
    if (previousValue && previousValue !== result.url) {
      await deleteUploadedAsset(previousValue);
    }
    toast.success('Upload successful', { description: `${file.name} has been uploaded.` });
    return true;
  } catch {
    toast.error('Upload failed', { description: 'An unexpected error occurred' });
    return false;
  }
};
