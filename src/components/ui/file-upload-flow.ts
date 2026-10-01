import { toast } from 'sonner';

import {
  uploadFile,
  validateFile,
  type TemplateUploadBucket,
  type UploadResult,
} from '@/lib/utils/fileUpload';

export type FileUploadType = 'image' | 'video' | 'file';

const BUCKET_BY_TYPE: Record<FileUploadType, TemplateUploadBucket> = {
  image: 'template-images',
  video: 'template-videos',
  file: 'template-files',
};

export type UploadedFileInfo = { url: string; fileName?: string; fileSize?: number };

// Feedback goes through sonner, the only toast renderer the app mounts (src/app/providers.tsx), so a
// rejected upload always tells the user why.
export const uploadSelectedFile = async ({
  file,
  type,
  onUploadStart,
  onUploaded,
}: {
  file: File;
  type: FileUploadType;
  // Receives the upload as it starts, so a page can wait for it before saving or leaving.
  onUploadStart?: (upload: Promise<UploadResult>) => void;
  onUploaded: (info: UploadedFileInfo) => void;
}): Promise<boolean> => {
  const validation = validateFile(file, type);
  if (!validation.valid) {
    toast.error('Invalid file', { description: validation.error });
    return false;
  }

  try {
    const upload = uploadFile(file, BUCKET_BY_TYPE[type]);
    onUploadStart?.(upload);
    const result = await upload;
    if (!result.success || !result.url) {
      toast.error('Upload failed', { description: result.error || 'Unknown error occurred' });
      return false;
    }

    // The previous upload is never deleted here: the saved template, its runs,
    // versions, and copies may still reference it, and this change is unsaved.
    onUploaded({ url: result.url, fileName: result.fileName, fileSize: result.fileSize });
    toast.success('Upload successful', { description: `${file.name} has been uploaded.` });
    return true;
  } catch {
    toast.error('Upload failed', { description: 'An unexpected error occurred' });
    return false;
  }
};
