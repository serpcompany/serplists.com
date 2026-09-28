import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createBillingCheckout: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  api: { createBillingCheckout: mocks.createBillingCheckout },
}));

vi.mock('sonner', () => ({
  toast: { error: mocks.toastError, success: vi.fn() },
}));

import {
  ORGANIZATION_UPGRADE_MESSAGE,
  handleUpgradeRequiredForContext,
} from '@/lib/access-flow';
import { BILLING_UNAVAILABLE_MESSAGE } from '@/lib/api-errors';

describe('handleUpgradeRequiredForContext', () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    mocks.createBillingCheckout.mockReset();
    mocks.toastError.mockReset();
    globalThis.window = originalWindow;
  });

  it('starts a Personal checkout in the Personal context', async () => {
    const location = { href: 'http://localhost/dashboard/templates' };
    globalThis.window = { location } as unknown as Window & typeof globalThis;
    mocks.createBillingCheckout.mockResolvedValue({ url: 'https://checkout.example/session' });

    const redirecting = await handleUpgradeRequiredForContext({
      billingEnabled: true,
      isTeamWorkspace: false,
    });

    expect(mocks.createBillingCheckout).toHaveBeenCalledTimes(1);
    expect(location.href).toBe('https://checkout.example/session');
    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(redirecting).toBe(true);
  });

  it('shows the Organization plan message and never starts a Personal checkout', async () => {
    const redirecting = await handleUpgradeRequiredForContext({
      billingEnabled: true,
      isTeamWorkspace: true,
    });

    expect(mocks.createBillingCheckout).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledTimes(1);
    expect(mocks.toastError).toHaveBeenCalledWith(ORGANIZATION_UPGRADE_MESSAGE);
    expect(redirecting).toBe(false);
  });

  it('reports billing as unavailable once when billing is disabled', async () => {
    const redirecting = await handleUpgradeRequiredForContext({
      billingEnabled: false,
      isTeamWorkspace: false,
    });

    expect(mocks.createBillingCheckout).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledTimes(1);
    expect(mocks.toastError).toHaveBeenCalledWith(BILLING_UNAVAILABLE_MESSAGE);
    expect(redirecting).toBe(false);
  });
});
