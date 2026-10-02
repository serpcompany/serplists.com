import { describe, expect, it } from 'vitest';

import { TEMPLATE_UPDATE_RESPONSE_ERROR, parseTemplateUpdateResponse } from '@/lib/templateUpdateResult';

describe('parseTemplateUpdateResponse', () => {
  it('reads the stored version and slug', () => {
    expect(parseTemplateUpdateResponse({ success: true, id: 'template-1', version: 4, slug: 'launch' })).toEqual({
      version: 4,
      slug: 'launch',
    });
  });

  it('treats a missing or null slug as unknown', () => {
    expect(parseTemplateUpdateResponse({ success: true, version: 2, slug: null })).toEqual({ version: 2, slug: undefined });
  });

  it('rejects an answer without a version instead of guessing one', () => {
    expect(() => parseTemplateUpdateResponse({ success: true, slug: 'launch' })).toThrow(TEMPLATE_UPDATE_RESPONSE_ERROR);
  });
});
