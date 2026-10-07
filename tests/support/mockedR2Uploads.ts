import { vi } from 'vitest';

vi.mock('@/lib/api', async () => (await import('./uploadMocks')).r2UploadApi());
vi.mock('@/lib/imageOptimization', async () => (await import('./uploadMocks')).imageOptimizationThatKeepsTheFile());
