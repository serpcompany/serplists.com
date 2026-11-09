import { describe, expect, it } from 'vitest';

import { firstOf } from '../../../support/elements';
import { parseTemplatesFromData, parseTemplatesFromFile } from '@/lib/utils/templateBackup';
import { PORTABLE_TEMPLATE_PACK_SCHEMA_VERSION } from '@/lib/schemas/checklistSchema';
import { createMockTemplate } from '../../../fixtures/templateBackupFixtures';
import { jsonFile } from '../../../fixtures/jsonFile';

const textFile = (text: string, name: string) => new File([text], name, { type: 'text/plain' });

const SHELTER = ['    sections:', '      - title: Shelter', '        items:', '          - title: Pack the tent'];

describe('the Template files the import reads', () => {
  it('reads every template of a YAML pack', async () => {
    const pack = [
      'kind: serplists-template-pack',
      `schemaVersion: ${PORTABLE_TEMPLATE_PACK_SCHEMA_VERSION}`,
      'exportedAt: "2026-03-22T00:00:00.000Z"',
      'templates:',
      '  - title: Camping',
      ...SHELTER,
      '  - title: Hiking',
      ...SHELTER,
    ].join('\n');

    const result = await parseTemplatesFromFile(textFile(pack, 'outdoor.yaml'));

    expect(result.templates.map(({ title }) => title)).toEqual(['Camping', 'Hiking']);
  });

  it('refuses a file whose name is not a Template file type', async () => {
    await expect(parseTemplatesFromFile(textFile('title: Camping', 'camping.txt'))).rejects.toThrow('Unsupported template file type');
  });

  it('says the file could not be read when the browser fails to read it', async () => {
    const unreadable = Object.assign(textFile('[]', 'camping.json'), { arrayBuffer: () => Promise.reject(new Error('The file was moved')) });

    await expect(parseTemplatesFromFile(unreadable)).rejects.toThrow('Failed to read file');
  });

  it('refuses JSON that is neither a backup nor a list of templates', async () => {
    await expect(parseTemplatesFromFile(jsonFile({ name: 'Camping' }, 'camping.json'))).rejects.toThrow(
      'Template validation failed: Unsupported JSON format (expected backup or template array)',
    );
  });
});

describe('a JSON template the import reads', () => {
  const withoutSections = { ...createMockTemplate({ title: 'Camping' }), sections: undefined };

  it.each([
    ['has neither sections nor items', withoutSections, 'Template "Camping" is missing sections/items'],
    ['has sections that are not a list', { ...withoutSections, sections: 'Shelter, Food' }, 'Template "Camping" has invalid sections/items'],
    ['has sections stored as JSON that is not a list', { ...withoutSections, sections: '{"title":"Shelter"}' }, 'Template "Camping" has invalid sections/items'],
  ])('refuses a template that %s', async (_label, template, reason) => {
    await expect(parseTemplatesFromFile(jsonFile([template], 'camping.json'))).rejects.toThrow(`Template validation failed: ${reason}`);
  });

  it.each([
    ['a blank task in a section with no text title', [{ title: 7, items: ['  '] }], 'task 1 in section 1 is empty'],
    ['a content block that is not an object in an untitled task', [{ title: 'Shelter', items: [{ contents: ['Bring stakes'] }] }], 'content block 1 of task 1 in section "Shelter" must be an object'],
    ['a form field that is not an object', [{ title: 'Shelter', items: [{ title: 'Tent', contents: [{ type: 'form', value: '', fields: ['Size'] }] }] }], 'form field 1 of task "Tent" must be an object with a label and a kind'],
  ])('names where the problem is for %s', (_label, sections, problem) => {
    expect(() => parseTemplatesFromData([{ ...withoutSections, sections }])).toThrow(`Template "Camping": ${problem}`);
  });

  it('reads a later section with no task list as a section with no tasks', () => {
    const sections = [{ id: 's1', title: 'Shelter', items: [{ id: 'i1', title: 'Tent' }] }, { id: 's2', title: 'Food' }];

    expect(firstOf(parseTemplatesFromData([{ ...withoutSections, sections }]).templates).sections).toMatchObject([
      { title: 'Shelter', items: [{ title: 'Tent' }] },
      { title: 'Food', items: [] },
    ]);
  });

  it('reads empty sections as none, a template with no version as the first, and tags and a category written as text', () => {
    const template = firstOf(
      parseTemplatesFromData([{ ...withoutSections, sections: [], version: undefined, tags: 'outdoor', categories: undefined, category: 'Travel' }]).templates,
    );

    expect(template).toMatchObject({ sections: [], version: 1, tags: ['outdoor'], categories: ['Travel'] });
    expect(firstOf(parseTemplatesFromData([{ ...withoutSections, sections: [], tags: '  ' }]).templates).tags).toEqual([]);
  });

  it("names a skipped template of a pack that has no title by its place in the pack", () => {
    const result = parseTemplatesFromData({
      kind: 'serplists-template-pack',
      schemaVersion: PORTABLE_TEMPLATE_PACK_SCHEMA_VERSION,
      exportedAt: '2026-03-22T00:00:00.000Z',
      templates: [
        { title: 'Camping', sections: [{ title: 'Shelter', items: [{ title: 'Pack the tent' }] }] },
        { sections: [] },
      ],
    });

    expect(result.templates.map(({ title }) => title)).toEqual(['Camping']);
    expect(result.warnings.map(({ templateTitle }) => templateTitle)).toEqual(['Template 2']);
  });
});
