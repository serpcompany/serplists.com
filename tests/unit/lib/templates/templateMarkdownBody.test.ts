import { describe, expect, it } from 'vitest';

import { parseTemplateMarkdownBody } from '@/lib/templates/templateMarkdownBody';

const FENCE = '```';

describe('parseTemplateMarkdownBody', () => {
  it('keeps a content block before the first section in the template description', () => {
    const body = ['Intro', `${FENCE}serplists:text`, 'Read me first.', FENCE, '', '## Prep', '### Pack'].join('\n');

    const parsed = parseTemplateMarkdownBody(body);

    expect(parsed.description).toBe(['Intro', `${FENCE}serplists:text`, 'Read me first.', FENCE].join('\n'));
    expect(parsed.sections).toEqual([{ title: 'Prep', items: [{ title: 'Pack', description: '', blocks: [] }] }]);
  });

  it('drops text and blocks between a section heading and its first item, which the format has no place for', () => {
    const body = [
      '## Prep',
      'Stray text',
      `${FENCE}serplists:text`,
      'Stray block',
      FENCE,
      '### Pack',
      'Bring the tent.',
    ].join('\n');

    expect(parseTemplateMarkdownBody(body)).toEqual({
      description: '',
      sections: [{ title: 'Prep', items: [{ title: 'Pack', description: 'Bring the tent.', blocks: [] }] }],
    });
  });
});
