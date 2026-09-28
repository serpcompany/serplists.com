import { readFileSync } from 'node:fs';
import path from 'node:path';

import Ajv from 'ajv';
import { describe, expect, it } from 'vitest';

import {
  PORTABLE_TEMPLATE_PACK_SCHEMA_VERSION,
  portableTemplatePackSchema,
} from '@/lib/schemas/checklistSchema';
import { buildPortableTemplatePackJsonSchema } from '@/lib/schemas/portableTemplateJsonSchema';
import { normalizeSections } from '@/lib/utils/checklistSections';
import { exportPortableTemplatesToJSON, prepareTemplatesForImport } from '@/lib/utils/templateBackup';
import type { ChecklistTemplate } from '@/types/checklist';

// docs/generated/portable-template-pack.schema.json is the published contract for AI and
// external tools. It must accept exactly what the importer (the Zod schema) accepts: the
// content rules used to live in a superRefine the JSON Schema could not see, and every
// object was additionalProperties:false although Zod drops unknown keys, so the schema
// accepted packs the importer rejected and rejected SERP Lists' own exports.
const ajv = new Ajv({ allErrors: true, strict: false });
const validateWithJsonSchema = ajv.compile(buildPortableTemplatePackJsonSchema());

const verdicts = (data: unknown) => ({
  jsonSchema: validateWithJsonSchema(data) as boolean,
  importer: portableTemplatePackSchema.safeParse(data).success,
});

const pack = (templates: unknown[], extra: Record<string, unknown> = {}) => ({
  kind: 'serplists-template-pack',
  schemaVersion: PORTABLE_TEMPLATE_PACK_SCHEMA_VERSION,
  exportedAt: '2026-09-28T00:00:00.000Z',
  templates,
  ...extra,
});

const withContent = (content: Record<string, unknown>) =>
  pack([{ title: 'T', sections: [{ title: 'S', items: [{ title: 'I', contents: [content] }] }] }]);

const withItem = (item: Record<string, unknown>) =>
  pack([{ title: 'T', sections: [{ title: 'S', items: [item] }] }]);

const ACCEPTED: Array<[string, unknown]> = [
  ['a text block with no value', withContent({ type: 'text' })],
  ['a text block with an empty value', withContent({ type: 'text', value: '' })],
  ['an image with a value', withContent({ type: 'image', value: 'https://example.com/a.png', uploadType: 'url' })],
  ['an embed with a value', withContent({ type: 'embed', value: 'https://example.com/embed' })],
  ['a sub-task block with one sub-task', withContent({ type: 'subItems', subItems: [{ title: 'One' }] })],
  ['an item that carries isCompleted', withItem({ title: 'I', isCompleted: false })],
  [
    'a sub-task that carries isCompleted',
    withContent({ type: 'subItems', value: '', subItems: [{ id: 's1', title: 'One', isCompleted: true }] }),
  ],
  ['unknown keys on a content block', withContent({ type: 'text', value: 'x', notes: 'run note' })],
  ['an unknown key on a section', pack([{ title: 'T', sections: [{ title: 'S', extra: 1, items: [{ title: 'I' }] }] }])],
  ['an unknown key on a template and the pack', pack([{ title: 'T', owner: 'x', sections: [{ title: 'S', items: [{ title: 'I' }] }] }], { source: 'x' })],
];

const REJECTED: Array<[string, unknown]> = [
  ['an image with no value', withContent({ type: 'image' })],
  ['an image with an empty value', withContent({ type: 'image', value: '' })],
  ['an image with a blank value', withContent({ type: 'image', value: '   ' })],
  ['a video with no value', withContent({ type: 'video' })],
  ['a file with a blank value', withContent({ type: 'file', value: ' \n ' })],
  ['an embed with an empty value', withContent({ type: 'embed', value: '' })],
  ['a sub-task block with no sub-tasks', withContent({ type: 'subItems', subItems: [] })],
  ['a sub-task block without a sub-task list', withContent({ type: 'subItems', value: '' })],
  ['an unknown content type', withContent({ type: 'audio', value: 'x' })],
  ['an item with an empty title', withItem({ title: '' })],
  ['a section with no items', pack([{ title: 'T', sections: [{ title: 'S', items: [] }] }])],
  ['a template with no sections', pack([{ title: 'T', sections: [] }])],
  ['another schema version', { ...withItem({ title: 'I' }), schemaVersion: '1.0.0' }],
];

describe('portable template JSON Schema matches the importer', () => {
  it.each(ACCEPTED)('both accept %s', (_label, data) => {
    expect(verdicts(data)).toEqual({ jsonSchema: true, importer: true });
  });

  it.each(REJECTED)('both reject %s', (_label, data) => {
    expect(verdicts(data)).toEqual({ jsonSchema: false, importer: false });
  });

  it('agrees on the repo examples and public packs', () => {
    const root = process.cwd();
    const singleTemplates = ['minimal', 'full'].map((name) =>
      JSON.parse(readFileSync(path.join(root, `docs/product-specs/portable-templates/examples/${name}/template.json`), 'utf8')),
    );
    const publicPack = JSON.parse(
      readFileSync(path.join(root, 'src/data/public-template-packs/foundational-checklists.json'), 'utf8'),
    );

    expect(verdicts(pack(singleTemplates))).toEqual({ jsonSchema: true, importer: true });
    expect(verdicts(publicPack)).toEqual({ jsonSchema: true, importer: true });
  });
});

describe('portable export', () => {
  // As the app holds a stored template: normalizeSections adds isCompleted (and maps the
  // legacy completed), and run notes can be present.
  const storedTemplate = (): ChecklistTemplate => ({
    id: 't1',
    title: 'Launch',
    description: '',
    userId: 'u1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    isPublic: false,
    sections: normalizeSections([
      {
        id: 's1',
        title: 'Prep',
        items: [
          {
            id: 'i1',
            title: 'Pack',
            completed: true,
            notes: 'run note',
            contents: [
              { id: 'c1', type: 'image', value: 'https://example.com/a.png', uploadType: 'url' },
              { id: 'c2', type: 'subItems', value: '', subItems: [{ id: 'si1', title: 'Laptop', completed: true }] },
            ],
          },
        ],
      },
    ]),
  });

  it('validates against the JSON Schema and imports again', () => {
    const exported = JSON.parse(JSON.stringify(exportPortableTemplatesToJSON([storedTemplate()])));

    expect(verdicts(exported)).toEqual({ jsonSchema: true, importer: true });
  });

  it('validates after an import added completion state to every task', () => {
    const imported = prepareTemplatesForImport([storedTemplate()], 'u1');
    const exported = JSON.parse(JSON.stringify(exportPortableTemplatesToJSON(imported)));

    expect(verdicts(exported)).toEqual({ jsonSchema: true, importer: true });
  });

  it('leaves out run state and other keys that are not part of the portable format', () => {
    const exported = exportPortableTemplatesToJSON([storedTemplate()]);
    const serialized = JSON.stringify(exported.templates[0].sections);

    expect(serialized).not.toMatch(/"(isCompleted|completed|notes)"/);
    expect(exported.templates[0].sections).toEqual([
      {
        id: 's1',
        title: 'Prep',
        items: [
          {
            id: 'i1',
            title: 'Pack',
            contents: [
              { id: 'c1', type: 'image', value: 'https://example.com/a.png', uploadType: 'url' },
              { id: 'c2', type: 'subItems', value: '', subItems: [{ id: 'si1', title: 'Laptop' }] },
            ],
          },
        ],
      },
    ]);
  });
});
