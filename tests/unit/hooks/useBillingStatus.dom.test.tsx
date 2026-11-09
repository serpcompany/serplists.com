import { act } from 'react';
import { waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { getBillingStatus } = vi.hoisted(() => ({ getBillingStatus: vi.fn() }));

vi.mock('@/lib/api', () => ({ api: { getBillingStatus } }));

import { useBillingStatus } from '@/hooks/useBillingStatus';
import { createApiError } from '@/lib/api-errors';

import { mountQueryHook } from '../../support/queryHookProbe';

describe('useBillingStatus', () => {
  it("reads the Organization's plan, and reads it again on refetch after a failed read", async () => {
    getBillingStatus.mockRejectedValueOnce(createApiError(403, { error: 'Forbidden' }));
    getBillingStatus.mockResolvedValue({ plan: 'pro', billingEnabled: true });
    const billing = await mountQueryHook(() => useBillingStatus({ enabled: true, teamId: 'team-1', userId: 'user-1' }));

    await waitFor(() => expect(billing.current().status).toBe('error'));
    expect(getBillingStatus).toHaveBeenCalledWith({ teamId: 'team-1' });

    act(() => billing.current().refetch());

    await waitFor(() => expect(billing.current()).toMatchObject({ status: 'known', plan: 'pro', isPaid: true }));
    expect(getBillingStatus).toHaveBeenCalledTimes(2);
    billing.unmount();
  });

  it('reads the Personal plan without naming an Organization', async () => {
    getBillingStatus.mockReset();
    getBillingStatus.mockResolvedValue({ plan: 'free', billingEnabled: true });
    const billing = await mountQueryHook(() => useBillingStatus({ enabled: true, userId: 'user-1' }));

    await waitFor(() => expect(billing.current()).toMatchObject({ status: 'known', plan: 'free', isPaid: false }));
    expect(getBillingStatus).toHaveBeenCalledWith(undefined);
    billing.unmount();
  });
});
