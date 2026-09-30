import { api } from '@/lib/api';

export const fetchBillingStatus = (teamId?: string) => api.getBillingStatus(teamId ? { teamId } : undefined);

export const createBillingPortalUrl = async (): Promise<string> => (await api.createBillingPortal()).url;
