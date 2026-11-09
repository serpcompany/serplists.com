import type { AuthStatus } from '@/lib/schemas/authStatus';

export const authStatusWith = (overrides: Partial<AuthStatus> = {}): AuthStatus => ({
  accountRegistrationAvailable: true,
  emailAuthAvailable: true,
  emailVerificationRequired: false,
  ...overrides,
});
