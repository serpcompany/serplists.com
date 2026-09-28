import { beforeEach, describe, expect, it, vi } from 'vitest';

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const uploadMocks = vi.hoisted(() => ({
  uploadFile: vi.fn(),
  deleteUploadedAsset: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: toastMock }));

vi.mock('@/lib/utils/fileUpload', async () => {
  const actual = await vi.importActual<typeof import('@/lib/utils/fileUpload')>('@/lib/utils/fileUpload');
  return { ...actual, ...uploadMocks };
});

import { uploadSelectedFile } from '@/components/ui/file-upload-flow';

const fileOf = (name: string, type: string, size = 1024) => {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};

describe('uploadSelectedFile', () => {
  beforeEach(() => {
    toastMock.success.mockReset();
    toastMock.error.mockReset();
    uploadMocks.uploadFile.mockReset();
    uploadMocks.deleteUploadedAsset.mockReset().mockResolvedValue(true);
  });

  it('shows the server error when the upload is rejected, as for a .csv in a File block', async () => {
    uploadMocks.uploadFile.mockResolvedValue({ success: false, error: 'Unsupported file type for bucket' });
    const onUploaded = vi.fn();

    const uploaded = await uploadSelectedFile({
      file: fileOf('data.csv', 'text/csv'),
      type: 'file',
      userId: 'user-1',
      previousValue: '',
      onUploaded,
    });

    expect(uploaded).toBe(false);
    expect(uploadMocks.uploadFile).toHaveBeenCalledWith(expect.any(File), 'template-files', 'user-1');
    expect(toastMock.error).toHaveBeenCalledWith('Upload failed', {
      description: 'Unsupported file type for bucket',
    });
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it('explains a file that fails client validation without uploading it', async () => {
    const uploaded = await uploadSelectedFile({
      file: fileOf('clip.mp4', 'video/mp4', 60 * 1024 * 1024),
      type: 'video',
      userId: 'user-1',
      previousValue: '',
      onUploaded: vi.fn(),
    });

    expect(uploaded).toBe(false);
    expect(uploadMocks.uploadFile).not.toHaveBeenCalled();
    expect(toastMock.error).toHaveBeenCalledWith('Invalid file', {
      description: 'File size must be less than 50MB',
    });
  });

  it('reports an unexpected failure', async () => {
    uploadMocks.uploadFile.mockRejectedValue(new Error('boom'));

    await uploadSelectedFile({
      file: fileOf('guide.pdf', 'application/pdf'),
      type: 'file',
      userId: 'user-1',
      previousValue: '',
      onUploaded: vi.fn(),
    });

    expect(toastMock.error).toHaveBeenCalledWith('Upload failed', {
      description: 'An unexpected error occurred',
    });
  });

  it('confirms a successful upload and removes the asset it replaced', async () => {
    uploadMocks.uploadFile.mockResolvedValue({
      success: true,
      url: '/api/uploads/file?key=new',
      fileName: 'guide.pdf',
      fileSize: 1024,
    });
    const onUploaded = vi.fn();

    const uploaded = await uploadSelectedFile({
      file: fileOf('guide.pdf', 'application/pdf'),
      type: 'file',
      userId: 'user-1',
      previousValue: '/api/uploads/file?key=old',
      onUploaded,
    });

    expect(uploaded).toBe(true);
    expect(onUploaded).toHaveBeenCalledWith({
      url: '/api/uploads/file?key=new',
      fileName: 'guide.pdf',
      fileSize: 1024,
    });
    expect(uploadMocks.deleteUploadedAsset).toHaveBeenCalledWith('/api/uploads/file?key=old');
    expect(toastMock.success).toHaveBeenCalledWith('Upload successful', {
      description: 'guide.pdf has been uploaded.',
    });
    expect(toastMock.error).not.toHaveBeenCalled();
  });
});
