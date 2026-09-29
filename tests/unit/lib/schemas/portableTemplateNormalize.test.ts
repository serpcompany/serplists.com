import { describe, expect, it } from 'vitest';

import { parsePortableTemplate } from '@/lib/schemas/portableTemplateNormalize';

describe('parsePortableTemplate', () => {
  it('keeps sub-items only on Sub-tasks blocks, the only ones the run page shows', () => {
    const result = parsePortableTemplate({
      title: 'Launch plan',
      sections: [{
        title: 'Launch',
        items: [{
          title: 'Write copy',
          contents: [
            { type: 'text', value: 'Steps', subItems: [{ title: 'Hidden' }] },
            { type: 'image', value: 'https://example.com/a.png', subItems: [{ title: 'Hidden too' }] },
            { type: 'subItems', value: '', subItems: [{ title: 'Visible' }] },
          ],
        }],
      }],
    });

    expect(result.success).toBe(true);
    const contents = result.success ? result.data.sections[0].items[0].contents : [];
    expect(contents?.map((content) => [content.type, content.subItems])).toEqual([
      ['text', undefined],
      ['image', undefined],
      ['subItems', [{ title: 'Visible' }]],
    ]);
  });
});
