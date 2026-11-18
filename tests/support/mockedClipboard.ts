import { vi } from 'vitest';

vi.mock('@/lib/clipboard', () => ({ copyTextToClipboard: vi.fn() }));
