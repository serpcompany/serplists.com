import { vi } from 'vitest';

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), info: vi.fn(), message: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));
