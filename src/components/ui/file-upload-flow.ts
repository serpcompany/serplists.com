import { toast } from 'sonner';

import {
  uploadFile,
  validateFile,
  type TemplateUploadBucket,
  type UploadResult,
} from '@/lib/utils/fileUpload';

export type FileUploadType = 'image' | 'video' | 'file';

export const UPLOAD_BUCKET_BY_TYPE: Record<FileUploadType, TemplateUploadBucket> = {
  image: 'template-images',
  video: 'template-videos',
  file: 'template-files',
};

export type UploadedFileInfo = { url: string; fileName?: string; fileSize?: number };

export const uploadSelectedFile = async ({
  file,
  type,
  onUploadStart,
  onUploaded,
}: {
  file: File;
  type: FileUploadType;
  onUploadStart?: (upload: Promise<UploadResult>) => void;
  onUploaded: (info: UploadedFileInfo) => void;
}): Promise<boolean> => {
  const validation = validateFile(file, type);
  if (!validation.valid) {
    toast.error('Invalid file', { description: validation.error });
    return false;
  }

  try {
    const upload = uploadFile(file, UPLOAD_BUCKET_BY_TYPE[type]);
    onUploadStart?.(upload);
    const result = await upload;
    if (!result.success || !result.url) {
      toast.error('Upload failed', { description: result.error || 'Unknown error occurred' });
      return false;
    }

    onUploaded({ url: result.url, fileName: result.fileName, fileSize: result.fileSize });
    toast.success('Upload successful', { description: `${file.name} has been uploaded.` });
    return true;
  } catch {
    toast.error('Upload failed', { description: 'An unexpected error occurred' });
    return false;
  }
};
