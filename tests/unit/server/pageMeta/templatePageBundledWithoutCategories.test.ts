import { serverContext, unreachableD1 } from '../../../support/mockedServerContext';
import { assert, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/repoTemplateCatalog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/repoTemplateCatalog')>();
  return {
    ...actual,
    repoTemplates: actual.repoTemplates.map((template) => ({ ...template, categories: undefined })),
  };
});

import { loadTemplatePageSeo } from '@/server/pageMeta/templatePage';

describe('the metadata of a bundled library template whose file names no categories', () => {
  it('describes it with the general checklist keywords, without reading D1', async () => {
    serverContext.env = { DB: unreachableD1 };
    serverContext.host = 'serplists.com';

    const lookup = await loadTemplatePageSeo('serp', 'ultimate-camping-checklist');

    assert(lookup.kind === 'found');
    expect(lookup.seo.keywords).toEqual(['checklist', 'template']);
    expect(lookup.seo.path).toBe('/profile/serp/ultimate-camping-checklist/');
  });
});
