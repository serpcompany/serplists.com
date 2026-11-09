import { describe, expect, it, vi } from 'vitest';

const apiMock = vi.hoisted(() => ({ createTemplate: vi.fn(), getChecklists: vi.fn(), getTemplates: vi.fn() }));

vi.mock('@/lib/api', () => ({ api: apiMock }));

import { aTemplatesProviderForEachTest } from '../../support/templatesProviderHarness';

const renderTemplatesProvider = aTemplatesProviderForEachTest();

describe('createTemplate called from JavaScript with no visibility, which the Template type rules out', () => {
  it('creates the template public', async () => {
    apiMock.createTemplate.mockResolvedValue({ id: 'template-9', slug: 'quick-list' });
    const { context } = renderTemplatesProvider();

    const created = await context.createTemplate({ title: 'Quick list', sections: [] });

    expect(apiMock.createTemplate).toHaveBeenCalledWith(expect.objectContaining({ title: 'Quick list', is_public: true }));
    expect(created).toMatchObject({ id: 'template-9', isPublic: true });
  });
});
