import { beforeEach, describe, expect, it, vi } from 'vitest';

import '../../../support/mockedServerContext';

const catalog = vi.hoisted(() => ({ body: null as unknown }));

vi.mock('@/server/api', () => ({
  fetchApi: async () => Response.json(catalog.body),
}));

import { loadCategoryPageSeo } from '@/server/pageMeta/categoryPage';

const catalogRow = (id: string, items: string) => ({
  id,
  title: `Template ${id}`,
  slug: id,
  is_public: 1,
  owner_username: 'alice',
  categories: ['Moving Day'],
  items,
});

beforeEach(() => {
  catalog.body = [];
});

describe('category page metadata from what the catalog answers', () => {
  it('counts no catalog template when the catalog answers with something other than a list', async () => {
    catalog.body = { templates: [catalogRow('moving-day', '[]')] };

    expect(await loadCategoryPageSeo('moving-day')).toBeNull();
    expect((await loadCategoryPageSeo('engineering'))?.description).toMatch(/^0 templates for Engineering & Development\./);
  });

  it('counts the other templates when one catalog row holds items that are not JSON', async () => {
    catalog.body = [catalogRow('moving-day', '[]'), catalogRow('broken-moving-day', 'not json')];

    expect((await loadCategoryPageSeo('moving-day'))?.description).toBe(
      '1 template for Moving Day. Templates filed under Moving Day.',
    );
  });
});
