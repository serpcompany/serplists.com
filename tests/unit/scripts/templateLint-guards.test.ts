import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PortableChecklistTemplate } from '@/lib/schemas/checklistSchema';
import { lintSingleTemplateSource } from '@/../scripts/lib/templateLint';

const { parsed } = vi.hoisted(() => {
  const holder: { template: PortableChecklistTemplate } = { template: { title: 'Launch Checklist', sections: [] } };
  return { parsed: holder };
});

vi.mock('node:fs/promises', () => ({
  readFile: () => Promise.resolve('the YAML the parser stand-in ignores'),
}));

vi.mock('@/lib/templates/templateMarkdown', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/templates/templateMarkdown')>()),
  parseTemplateYaml: () => parsed.template,
}));

vi.mock('@/lib/templates/portableTemplateNormalization', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/templates/portableTemplateNormalization')>()),
  normalizePortableTemplate: (template: PortableChecklistTemplate) => template,
}));

const RULE_CODES = new Set(['empty-template', 'empty-section', 'empty-content-value', 'empty-subitems']);

async function ruleIssuesOf(template: PortableChecklistTemplate) {
  parsed.template = template;
  const issues = await lintSingleTemplateSource('/repo/template.yaml');
  return issues.filter((issue) => RULE_CODES.has(issue.code));
}

describe('the template rules, should a parser and the normalizer let through what the schema refuses', () => {
  beforeEach(() => {
    parsed.template = { title: 'Launch Checklist', sections: [] };
  });

  it('refuses a template with no sections', async () => {
    await expect(ruleIssuesOf({ title: 'Launch Checklist', sections: [] })).resolves.toEqual([
      { filePath: '/repo/template.yaml', code: 'empty-template', message: 'Template must include at least one section' },
    ]);
  });

  it('refuses a section with no items, a media block with no value and a sub-items block with no sub-items, naming where each is', async () => {
    const issues = await ruleIssuesOf({
      title: 'Launch Checklist',
      sections: [
        { title: 'Later', items: [] },
        {
          title: 'Preparation',
          items: [
            {
              title: 'Review content',
              contents: [
                { type: 'image', value: '  ' },
                { type: 'embed', value: '' },
                { type: 'subItems', value: '', subItems: [] },
              ],
            },
          ],
        },
      ],
    });

    expect(issues.map(({ code, message }) => [code, message])).toEqual([
      ['empty-section', 'Section 1 "Later" must include at least one item'],
      ['empty-content-value', 'Item 2.1 content block 1 (image) requires a value'],
      ['empty-content-value', 'Item 2.1 content block 2 (embed) requires a value'],
      ['empty-subitems', 'Item 2.1 sub-items content must include at least one sub-item'],
    ]);
  });
});
