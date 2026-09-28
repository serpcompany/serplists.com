import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCreateBillingCheckout, mockToastError } = vi.hoisted(() => ({
  mockCreateBillingCheckout: vi.fn(),
  mockToastError: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  api: { createBillingCheckout: mockCreateBillingCheckout },
}));

vi.mock('sonner', () => ({
  toast: { error: mockToastError, success: vi.fn() },
}));

import {
  handleUpgradeRequired,
  ORGANIZATION_UPGRADE_MESSAGE,
} from '@/lib/access-flow';
import { BILLING_UNAVAILABLE_MESSAGE } from '@/lib/api-errors';

const originalWindow = (globalThis as { window?: unknown }).window;

describe('handleUpgradeRequired', () => {
  beforeEach(() => {
    mockCreateBillingCheckout.mockReset();
    mockToastError.mockReset();
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { location: { href: 'https://serplists.com/profile/alice/t' } },
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow,
    });
  });

  it('never starts a Personal checkout while an Organization is active', async () => {
    const started = await handleUpgradeRequired({
      billingEnabled: true,
      isTeamWorkspace: true,
    });

    expect(started).toBe(false);
    expect(mockCreateBillingCheckout).not.toHaveBeenCalled();
    expect(mockToastError).toHaveBeenCalledWith(ORGANIZATION_UPGRADE_MESSAGE);
    expect(ORGANIZATION_UPGRADE_MESSAGE).toBe(
      'This Organization needs a paid plan before using this feature.',
    );
  });

  it('starts Personal checkout in Personal', async () => {
    mockCreateBillingCheckout.mockResolvedValue({
      url: 'https://checkout.stripe.com/c/pay/test',
    });

    const started = await handleUpgradeRequired({
      billingEnabled: true,
      isTeamWorkspace: false,
    });

    expect(started).toBe(true);
    expect(mockCreateBillingCheckout).toHaveBeenCalledTimes(1);
    expect((globalThis as unknown as { window: Window }).window.location.href).toBe(
      'https://checkout.stripe.com/c/pay/test',
    );
  });

  it('shows the billing-unavailable message in Personal when billing is off', async () => {
    const started = await handleUpgradeRequired({
      billingEnabled: false,
      isTeamWorkspace: false,
    });

    expect(started).toBe(false);
    expect(mockCreateBillingCheckout).not.toHaveBeenCalled();
    expect(mockToastError).toHaveBeenCalledWith(BILLING_UNAVAILABLE_MESSAGE);
  });
});
