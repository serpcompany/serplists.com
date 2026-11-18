import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { toast } from 'sonner';

import { authClient, getAuthStatus } from '@/lib/auth-client';

import { authStatusWith } from '../fixtures/authStatus';
import { theInMemoryBrowserAsTheWindow } from './renderInTheDom';

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    requestPasswordReset: vi.fn(),
    resetPassword: vi.fn(),
    sendVerificationEmail: vi.fn(),
  },
  getAuthStatus: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
}));

export function aFreshAuthPageInEachTest() {
  theInMemoryBrowserAsTheWindow();
  beforeEach(() => {
    vi.mocked(getAuthStatus).mockReset().mockResolvedValue(authStatusWith());
    vi.mocked(authClient.requestPasswordReset).mockReset();
    vi.mocked(authClient.resetPassword).mockReset();
    vi.mocked(authClient.sendVerificationEmail).mockReset();
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.info).mockClear();
    vi.mocked(toast.success).mockClear();
  });
  afterEach(() => cleanup());
}
