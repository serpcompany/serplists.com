import { vi } from 'vitest';

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  ...(await import('./hookStateSlots')).hooksKeptBetweenRenders,
}));
