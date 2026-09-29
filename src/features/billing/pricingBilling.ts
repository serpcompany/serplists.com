import { api } from '@/lib/api';

// The two billing requests the Pricing page makes, kept out of the page itself
// (docs/exec-plans/active/ui-decoupling.md): Personal billing status, and a new Personal
// checkout session's URL.

export const fetchPersonalBillingStatus = () => api.getBillingStatus();

export const createPersonalCheckoutUrl = async (): Promise<string> =>
  (await api.createBillingCheckout()).url;
