import { describe, expect, it } from 'vitest';
import {
  PORTABLE_TEMPLATE_PACK_SCHEMA_VERSION,
  portableTemplatePackSchema,
  validatePortableTemplatePack,
} from '@/lib/schemas/checklistSchema';

describe('portableTemplatePackSchema', () => {
  it('validates a portable template pack', () => {
    const data = {
      kind: 'serplists-template-pack',
      schemaVersion: PORTABLE_TEMPLATE_PACK_SCHEMA_VERSION,
      exportedAt: '2026-03-21T00:00:00.000Z',
      templates: [
        {
          title: 'Content Refresh Checklist',
          visibility: 'private',
          sections: [
            {
              title: 'Prep',
              items: [
                {
                  title: 'Review top pages',
                  contents: [{ type: 'text', value: 'Open analytics and export winners.' }],
                },
              ],
            },
          ],
        },
      ],
      manifest: {
        totalTemplates: 1,
        format: 'portable',
        includesVisibility: true,
      },
    };

    const result = portableTemplatePackSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('rejects subItems content without nested sub-items', () => {
    const data = {
      kind: 'serplists-template-pack',
      schemaVersion: PORTABLE_TEMPLATE_PACK_SCHEMA_VERSION,
      exportedAt: '2026-03-21T00:00:00.000Z',
      templates: [
        {
          title: 'Broken Template',
          sections: [
            {
              title: 'Prep',
              items: [
                {
                  title: 'Review top pages',
                  contents: [{ type: 'subItems', value: '' }],
                },
              ],
            },
          ],
        },
      ],
    };

    const result = portableTemplatePackSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('rejects media content without a value', () => {
    const data = {
      kind: 'serplists-template-pack',
      schemaVersion: PORTABLE_TEMPLATE_PACK_SCHEMA_VERSION,
      exportedAt: '2026-03-21T00:00:00.000Z',
      templates: [
        {
          title: 'Broken Template',
          sections: [
            {
              title: 'Prep',
              items: [
                {
                  title: 'Review top pages',
                  contents: [{ type: 'image', value: '' }],
                },
              ],
            },
          ],
        },
      ],
    };

    expect(() => validatePortableTemplatePack(data)).toThrow();
  });

  it('rejects unsupported schema versions at the canonical contract layer', () => {
    const data = {
      kind: 'serplists-template-pack',
      schemaVersion: '9.9.9',
      exportedAt: '2026-03-21T00:00:00.000Z',
      templates: [
        {
          title: 'Future Template',
          sections: [
            {
              title: 'Prep',
              items: [{ title: 'Review top pages' }],
            },
          ],
        },
      ],
    };

    const result = portableTemplatePackSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});
