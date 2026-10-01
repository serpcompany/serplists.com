import { vi, type Mock } from 'vitest';

import type { TemplateDetailBillingState } from '@/features/template-detail/useTemplateDetailModel';

type TemplateDetailApiOverrides = Partial<
  Record<
    'clonePublicTemplate' | 'getBillingStatus' | 'getProfileById' | 'getTemplateById' | 'getTemplateBySlug' | 'updateTemplate',
    Mock
  >
>;

export const templateDetailApiClient = (overrides: TemplateDetailApiOverrides = {}) => ({
  clonePublicTemplate: vi.fn(),
  getBillingStatus: vi.fn(),
  getProfileById: vi.fn(),
  getTemplateById: vi.fn(),
  getTemplateBySlug: vi.fn(),
  updateTemplate: vi.fn(),
  ...overrides,
});

export const apiClientThatClones = (clonePublicTemplate: Mock = vi.fn().mockResolvedValue({ id: 'clone-1' })) =>
  templateDetailApiClient({ clonePublicTemplate });

export const PRO_BILLING: TemplateDetailBillingState = {
  billingEnabled: true,
  isError: false,
  isLoading: false,
  isPro: true,
};
export const FREE_BILLING: TemplateDetailBillingState = { ...PRO_BILLING, isPro: false };
