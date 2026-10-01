import { api } from '@/lib/api';

export const fetchPersonalBillingStatus = () => api.getBillingStatus();

export const createPersonalCheckoutUrl = async (): Promise<string> =>
  (await api.createBillingCheckout()).url;
