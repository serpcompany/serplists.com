import { vi } from 'vitest';

vi.mock('@/lib/utils/fileUpload', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/utils/fileUpload')>()),
  uploadFile: vi.fn(),
}));
