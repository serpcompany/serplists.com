import { describe, expect, it } from 'vitest';

import { apiTemplateSchema } from '@/lib/schemas/apiTemplates';
import { mapApiTemplate } from '@/lib/templates/apiTemplateMapper';

const listed = (row: Record<string, unknown>) => mapApiTemplate(apiTemplateSchema.parse({ id: 'template-1', title: 'Camping', ...row }));

describe('a Template row from the list API', () => {
  it('puts a flat list of tasks stored before sections into one Checklist section', () => {
    const template = listed({ items: JSON.stringify([{ id: 'i1', title: 'Pack the tent' }]) });

    expect(template.sections.map(({ title, items }) => ({ title, tasks: items.map((item) => item.title) }))).toEqual([
      { title: 'Checklist', tasks: ['Pack the tent'] },
    ]);
  });

  it('keeps stored sections as they are, and opens a row with no tasks at all', () => {
    const stored = [{ id: 's1', title: 'Shelter', items: [{ id: 'i1', title: 'Pack the tent' }] }];

    expect(listed({ items: JSON.stringify(stored) }).sections.map(({ title }) => title)).toEqual(['Shelter']);
    expect(listed({}).sections).toEqual([]);
  });

  it('reads tags stored as JSON text, keeping only the text tags', () => {
    expect(listed({ tags: JSON.stringify(['outdoor', 7, 'family']) }).tags).toEqual(['outdoor', 'family']);
    expect(listed({ tags: JSON.stringify({ outdoor: true }) }).tags).toEqual([]);
  });

  it('reads a recipe, and a single category stored before Templates had several', () => {
    expect(listed({ type: 'recipe', category: 'Outdoor' })).toMatchObject({ type: 'recipe', categories: ['Outdoor'] });
    expect(listed({})).toMatchObject({ type: 'checklist', categories: [] });
  });
});
