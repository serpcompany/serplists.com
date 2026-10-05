import Ajv from 'ajv';
import { describe, expect, it } from 'vitest';
import { firstOf, taskIn } from '../../../support/elements';

import {
  PORTABLE_TEMPLATE_PACK_SCHEMA_VERSION,
  portableTemplatePackSchema,
} from '@/lib/schemas/checklistSchema';
import { normalizeSections } from '@/lib/utils/checklistSections';
import {
  exportPortableTemplatesToJSON,
  parseTemplatesFromData,
  prepareTemplatesForImport,
} from '@/lib/utils/templateBackup';
import type { ChecklistTemplate } from '@/types/checklist';
import foundationalChecklists from '@/data/public-template-packs/foundational-checklists.json';

import { portableTemplatePackJsonSchema } from '../../../support/portableTemplateChecks';
import fullExample from '../../../../docs/product-specs/portable-templates/examples/full/template.json';
import minimalExample from '../../../../docs/product-specs/portable-templates/examples/minimal/template.json';
import { z } from 'zod';
import { storedSections } from '../../../support/storedJson';

const ajv = new Ajv({ allErrors: true, strict: false });
const validateWithJsonSchema = ajv.compile(portableTemplatePackJsonSchema());

const packAsTheFileHoldsIt = z
  .object({
    manifest: z.object({ skippedTemplates: z.unknown().optional() }).passthrough(),
    templates: z.array(z.object({ sections: storedSections }).passthrough()),
  })
  .passthrough();

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

const withTools = (...requiredTools: unknown[]) =>
  pack([{ title: 'T', requiredTools, sections: [{ title: 'S', items: [{ title: 'I' }] }] }]);

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
  ['required and optional tools', withTools({ name: 'Timer', url: 'https://example.com', required: true }, { name: 'Deck', url: 'HTTP://example.com/a?b#c', required: false })],
  ['a tool without its required flag', withTools({ name: 'Timer', url: 'https://example.com/timer' })],
  ['an unknown key on a tool', withTools({ name: 'Timer', url: 'https://example.com', required: true, affiliate: 'x' })],
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
  ['a tool with a script link', withTools({ name: 'Timer', url: 'javascript:alert(1)', required: true })],
  ['a tool with a link that is not http or https', withTools({ name: 'Timer', url: 'ftp://example.com', required: true })],
  ['a tool link with a space', withTools({ name: 'Timer', url: 'https://example.com/a b', required: true })],
  ['a tool with a blank name', withTools({ name: '  ', url: 'https://example.com', required: true })],
  ['a tool without a link', withTools({ name: 'Timer', required: true })],
  ['a tool whose required flag is not true or false', withTools({ name: 'Timer', url: 'https://example.com', required: 'yes' })],
];

describe('the published portable template JSON Schema accepts exactly what the importer accepts', () => {
  it.each(ACCEPTED)('both accept %s', (_label, data) => {
    expect(verdicts(data)).toEqual({ jsonSchema: true, importer: true });
  });

  it.each(REJECTED)('both reject %s', (_label, data) => {
    expect(verdicts(data)).toEqual({ jsonSchema: false, importer: false });
  });

  it('agrees on the repo examples and public packs', () => {
    expect(verdicts(pack([minimalExample, fullExample]))).toEqual({ jsonSchema: true, importer: true });
    expect(verdicts(foundationalChecklists)).toEqual({ jsonSchema: true, importer: true });
  });
});

describe('portable export', () => {
  const storedTemplateWithRunStateAsTheAppHoldsIt = (): ChecklistTemplate => ({
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
    const exported: unknown = JSON.parse(JSON.stringify(exportPortableTemplatesToJSON([storedTemplateWithRunStateAsTheAppHoldsIt()])));

    expect(verdicts(exported)).toEqual({ jsonSchema: true, importer: true });
  });

  it('validates after an import added completion state to every task', () => {
    const imported = prepareTemplatesForImport([storedTemplateWithRunStateAsTheAppHoldsIt()], 'u1');
    const exported: unknown = JSON.parse(JSON.stringify(exportPortableTemplatesToJSON(imported)));

    expect(verdicts(exported)).toEqual({ jsonSchema: true, importer: true });
  });

  it('leaves out run state and other keys that are not part of the portable format', () => {
    const exported = exportPortableTemplatesToJSON([storedTemplateWithRunStateAsTheAppHoldsIt()]);
    const serialized = JSON.stringify(firstOf(exported.templates).sections);

    expect(serialized).not.toMatch(/"(isCompleted|completed|notes)"/);
    expect(firstOf(exported.templates).sections).toEqual([
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

describe('portable export of content blocks a lenient JSON import stored, keeping their template in the pack', () => {
  const importedTemplate = (contents: unknown[]) => {
    const { templates } = parseTemplatesFromData([
      { title: 'Launch', sections: [{ id: 's1', title: 'Prep', items: [{ id: 'i1', title: 'Write copy', contents }] }] },
    ]);
    return prepareTemplatesForImport(templates, 'u1');
  };
  const exportedContents = (contents: unknown[]) => {
    const exported: unknown = JSON.parse(JSON.stringify(exportPortableTemplatesToJSON(importedTemplate(contents))));
    const pack = packAsTheFileHoldsIt.parse(exported);
    expect(pack.manifest.skippedTemplates).toBeUndefined();
    expect(verdicts(exported)).toEqual({ jsonSchema: true, importer: true });
    return taskIn(firstOf(pack.templates).sections, 0, 0).contents;
  };

  it('exports a numeric id as a string and leaves out null file details', () => {
    expect(
      exportedContents([
        { id: 1, type: 'file', value: 'https://example.com/a.pdf', fileName: null, fileSize: null, uploadType: null },
      ]),
    ).toEqual([{ id: '1', type: 'file', value: 'https://example.com/a.pdf' }]);
  });

  it('exports a block whose only problem is a null file detail', () => {
    expect(
      exportedContents([{ id: 'c1', type: 'file', value: 'https://example.com/a.pdf', fileName: null, fileSize: 2048 }]),
    ).toEqual([{ id: 'c1', type: 'file', value: 'https://example.com/a.pdf', fileSize: 2048 }]);
  });

  it('leaves out an upload type the portable format does not define', () => {
    expect(
      exportedContents([{ id: 'c1', type: 'image', value: 'https://example.com/a.png', uploadType: 'link', fileName: 'a.png' }]),
    ).toEqual([{ id: 'c1', type: 'image', value: 'https://example.com/a.png', fileName: 'a.png' }]);
  });
});
