import { describe, expect, it } from 'vitest';

import { buildTemplateUpdateRequest, describeTemplateUpdate } from '@/lib/templates/templateUpdate';

describe('describeTemplateUpdate', () => {
  it('only mentions and refreshes runs when the checklist structure changed', () => {
    expect(describeTemplateUpdate({ success: true, structureChanged: true, reconciledRuns: 2 })).toEqual({
      invalidateRuns: true,
      message: 'Template updated. Checklist changes were reconciled into active private runs.',
    });
    expect(describeTemplateUpdate({ success: true, structureChanged: true, reconciledRuns: 0 })).toEqual({
      invalidateRuns: true,
      message: 'Template updated.',
    });
  });

  it('keeps runs untouched for metadata-only and no-op saves', () => {
    expect(describeTemplateUpdate({ success: true, structureChanged: false, reconciledRuns: 0 })).toEqual({
      invalidateRuns: false,
      message: 'Template updated.',
    });
    expect(describeTemplateUpdate(undefined).invalidateRuns).toBe(false);
  });
});

describe('buildTemplateUpdateRequest', () => {
  it('guards the save with the loaded version', () => {
    const request = buildTemplateUpdateRequest({
      id: 'template-1',
      title: 'Launch plan',
      sections: [],
      isPublic: false,
      seoUrl: ' launch-plan ',
      version: 3,
    });

    expect(request).toEqual(expect.objectContaining({ title: 'Launch plan', slug: 'launch-plan', expected_version: 3, is_public: false }));
  });

  it('leaves visibility out when the editor did not change it', () => {
    const request = buildTemplateUpdateRequest({ id: 'template-1', title: 'Launch plan', sections: [], version: 3 });

    expect(JSON.parse(JSON.stringify(request))).not.toHaveProperty('is_public');
  });
});
