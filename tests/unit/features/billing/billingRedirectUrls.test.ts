import { afterEach, describe, expect, it, vi } from 'vitest';

import { createBillingPortalUrl } from '@/features/billing/billingSettings';
import { createPersonalCheckoutUrl } from '@/features/billing/pricingBilling';
import { ApiError } from '@/lib/api-errors';

import { stringMatching } from '../../../support/asymmetricMatchers';

const fetchAnswering = (body: unknown) => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const sentRequest = (fetchMock: ReturnType<typeof fetchAnswering>) => {
  const [input, init] = fetchMock.mock.calls[0] ?? [];
  return { path: new URL(String(input), 'http://localhost').pathname, method: init?.method };
};

describe('the Stripe pages a billing button sends the person to', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens the billing portal the server made for the person', async () => {
    const fetchMock = fetchAnswering({ url: 'https://billing.stripe.com/p/session_1' });

    await expect(createBillingPortalUrl()).resolves.toBe('https://billing.stripe.com/p/session_1');
    expect(sentRequest(fetchMock)).toEqual({ path: stringMatching(/\/billing\/portal$/), method: 'POST' });
  });

  it('opens the Pro checkout the server made for the person', async () => {
    const fetchMock = fetchAnswering({ url: 'https://checkout.stripe.com/c/pay/cs_1' });

    await expect(createPersonalCheckoutUrl()).resolves.toBe('https://checkout.stripe.com/c/pay/cs_1');
    expect(sentRequest(fetchMock)).toEqual({ path: stringMatching(/\/billing\/checkout$/), method: 'POST' });
  });

  it('refuses an answer with no address to open', async () => {
    fetchAnswering({ sessionId: 'cs_1' });

    await expect(createPersonalCheckoutUrl()).rejects.toBeInstanceOf(ApiError);
  });
});
