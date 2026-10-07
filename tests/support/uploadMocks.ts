import { vi } from 'vitest';

export const r2UploadApi = () => ({
  api: {
    deleteFromR2: vi.fn(),
    uploadToR2: vi.fn(),
  },
});

export const imageOptimizationThatKeepsTheFile = () => ({
  isImageFile: vi.fn(() => false),
  optimizeImage: vi.fn(async (file: File) => file),
});
