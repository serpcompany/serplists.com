import { describe, expect, it } from 'vitest';

import { buildSampleTemplate } from '@/features/template-backup/sampleTemplate';
import { exportPortableTemplatesToJSON, parseTemplatesFromData } from '@/lib/utils/templateBackup';

import { arrayContaining } from '../../../support/asymmetricMatchers';

describe('the sample portable pack offered for download', () => {
  it('imports back as the Moving Checklist with every section, task and block it shows', () => {
    const sample = buildSampleTemplate();
    const downloaded: unknown = JSON.parse(JSON.stringify(exportPortableTemplatesToJSON([sample], 'Sample Export')));

    const { templates, warnings } = parseTemplatesFromData(downloaded);

    expect(warnings).toEqual([]);
    expect(templates.map(({ title, categories, tags }) => ({ title, categories, tags }))).toEqual([
      { title: 'Moving Checklist', categories: sample.categories, tags: sample.tags },
    ]);
    const outline = (sections: typeof sample.sections) =>
      sections.map((section) => [section.title, section.items.map((item) => [item.title, (item.contents ?? []).map((block) => block.type)])]);
    expect(outline(templates[0]?.sections ?? [])).toEqual(outline(sample.sections));
    expect(sample.sections.flatMap((section) => section.items.flatMap((item) => (item.contents ?? []).map((block) => block.type)))).toEqual(
      arrayContaining(['text', 'form', 'subItems']),
    );
  });
});
