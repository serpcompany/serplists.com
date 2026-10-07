import { vi } from 'vitest';

vi.mock('react', async (importOriginal) =>
  (await import('./reactHookStubs')).reactKeepingStateBetweenRenders(importOriginal, { useId: () => 'outline' }),
);
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
