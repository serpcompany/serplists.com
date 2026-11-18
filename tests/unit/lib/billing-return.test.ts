import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ getBillingStatus: vi.fn() }));
vi.mock('@/lib/api', () => ({ api: apiMocks }));

import { fetchPersonalBillingStatus, waitForPersonalPro } from '@/lib/billing-return';
import type { BillingStatus } from '@/lib/billing';

const noSleep = async () => {};

describe('fetchPersonalBillingStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads Personal status even while an Organization is selected, and refreshes its cache', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['billing', 'status', 'user-1', 'personal'], { plan: 'free' });
    apiMocks.getBillingStatus.mockResolvedValueOnce({ plan: 'pro' });

    await expect(fetchPersonalBillingStatus(queryClient, 'user-1')).resolves.toEqual({ plan: 'pro' });

    expect(apiMocks.getBillingStatus).toHaveBeenCalledWith();
    expect(queryClient.getQueryData(['billing', 'status', 'user-1', 'personal'])).toEqual({ plan: 'pro' });
  });
});

describe('waitForPersonalPro', () => {
  it('resolves pro once the webhook has activated the plan', async () => {
    const statuses: BillingStatus[] = [{ plan: 'free' }, { plan: 'free' }, { plan: 'pro' }];
    const fetchStatus = vi.fn(async () => statuses.shift());

    await expect(waitForPersonalPro(fetchStatus, { isCancelled: () => false, sleep: noSleep })).resolves.toBe('pro');
    expect(fetchStatus).toHaveBeenCalledTimes(3);
  });

  it('keeps polling through a failed status read', async () => {
    const fetchStatus = vi.fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ plan: 'pro' });

    await expect(waitForPersonalPro(fetchStatus, { isCancelled: () => false, sleep: noSleep })).resolves.toBe('pro');
  });

  it('gives up as pending after the last attempt', async () => {
    const fetchStatus = vi.fn(async () => ({ plan: 'free' as const }));

    await expect(
      waitForPersonalPro(fetchStatus, { attempts: 4, isCancelled: () => false, sleep: noSleep }),
    ).resolves.toBe('pending');
    expect(fetchStatus).toHaveBeenCalledTimes(4);
  });

  it('stops when cancelled', async () => {
    let cancelled = false;
    const fetchStatus = vi.fn(async () => {
      cancelled = true;
      return { plan: 'free' as const };
    });

    await expect(waitForPersonalPro(fetchStatus, { isCancelled: () => cancelled, sleep: noSleep })).resolves.toBe(
      'cancelled',
    );
    expect(fetchStatus).toHaveBeenCalledTimes(1);
  });

  it('waits a second and a half between reads, and stops when the page is left during the wait', async () => {
    vi.useFakeTimers();
    let cancelled = false;
    const fetchStatus = vi.fn(async () => ({ plan: 'free' as const }));

    const waiting = waitForPersonalPro(fetchStatus, { isCancelled: () => cancelled });
    await vi.advanceTimersByTimeAsync(1_499);
    expect(fetchStatus).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchStatus).toHaveBeenCalledTimes(2);

    cancelled = true;
    await vi.advanceTimersByTimeAsync(1_500);
    await expect(waiting).resolves.toBe('cancelled');
    expect(fetchStatus).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
