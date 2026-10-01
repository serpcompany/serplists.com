import { describe, expect, it } from 'vitest';

import {
  omitUnchangedTemplateColumns,
  templateStructureChanged,
} from '@functions/api/utils/template-changes';
import { withStableTemplateIdentities } from '@functions/api/utils/template-identities';
import { assignMissingStableTemplateIdentities } from '@functions/api/utils/template-reconciliation';
import { applyTemplateSaveDefaults } from '@/hooks/useTemplateValidation';
import { buildTemplateEditorFormValues, normalizeTemplateEditorFormForSave } from '@/lib/forms/templateEditorForm';
import { normalizePortableTemplate } from '@/lib/templates/portableTemplateNormalization';
import { parseTemplateMarkdown, renderTemplateMarkdown } from '@/lib/templates/templateMarkdown';
import type { ChecklistSection } from '@/types/checklist';
import type { PortableChecklistTemplate } from '@/lib/schemas/checklistSchema';

const storedSections = [
  {
    id: 'section-1',
    title: 'Launch',
    items: [
      {
        id: 'item-1',
        title: 'Write copy',
        description: 'Draft it',
        contents: [
          { id: 'content-1', type: 'subItems', value: '', subItems: [{ id: 'sub-1', title: 'Short' }] },
        ],
      },
      { id: 'item-2', title: 'Publish' },
    ],
  },
];

const storedSectionsAsTheEditorResendsThem = [
  {
    title: 'Launch',
    id: 'section-1',
    items: [
      {
        isCompleted: false,
        contents: [
          {
            value: '',
            type: 'subItems',
            id: 'content-1',
            fileName: undefined,
            subItems: [{ title: 'Short', id: 'sub-1', isCompleted: false }],
          },
        ],
        description: 'Draft it',
        title: 'Write copy',
        id: 'item-1',
      },
      { id: 'item-2', title: 'Publish', description: '', contents: [], isCompleted: false, completed: false, notes: '' },
    ],
  },
];

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const changed = (stored: unknown[], incoming: unknown[]) =>
  templateStructureChanged(stored, assignMissingStableTemplateIdentities(incoming, stored));

describe('templateStructureChanged', () => {
  it('treats resent sections with run state, key order, and empty defaults as unchanged', () => {
    expect(changed(storedSections, storedSectionsAsTheEditorResendsThem)).toBe(false);
  });

  it('treats an empty template and a missing items value as unchanged', () => {
    expect(changed([], [])).toBe(false);
  });

  it('matches legacy flat item arrays against the canonical Checklist section', () => {
    const legacy = [{ id: 'item-1', title: 'Only task' }];
    const sectionShape = [{ id: '1', title: 'Checklist', items: [{ id: 'item-1', title: 'Only task', isCompleted: false }] }];
    expect(changed(legacy, sectionShape)).toBe(false);
  });

  it('matches stored sections without ids against the ids assigned by position', () => {
    const withoutIds = [{ title: 'Prep', items: [{ title: 'Pack' }, { title: 'Drive' }] }];
    expect(changed(withoutIds, clone(withoutIds))).toBe(false);
  });

  it.each([
    ['an item title is renamed', (sections: typeof storedSectionsAsTheEditorResendsThem) => { sections[0].items[1].title = 'Ship'; }],
    ['items are reordered', (sections: typeof storedSectionsAsTheEditorResendsThem) => { sections[0].items.reverse(); }],
    ['an item is added', (sections: typeof storedSectionsAsTheEditorResendsThem) => {
      sections[0].items.push({ id: 'item-3', title: 'Announce' } as (typeof storedSectionsAsTheEditorResendsThem)[0]['items'][1]);
    }],
    ['a sub-item is added under contents', (sections: typeof storedSectionsAsTheEditorResendsThem) => {
      sections[0].items[0].contents[0].subItems.push({ title: 'Long', id: 'sub-2', isCompleted: false });
    }],
    ['a description changes', (sections: typeof storedSectionsAsTheEditorResendsThem) => { sections[0].items[0].description = 'Draft and edit'; }],
  ])('reports a change when %s', (_label, mutate) => {
    const incoming = clone(storedSectionsAsTheEditorResendsThem);
    mutate(incoming);
    expect(changed(storedSections, incoming)).toBe(true);
  });
});

describe('templateStructureChanged after an editor round trip of content blocks stored without ids, which the editor ids anew on load', () => {
  const seedSections: PortableChecklistTemplate['sections'] = [
    {
      id: 'sec-1',
      title: 'Crawlability',
      items: [
        {
          id: 't-1',
          title: 'Check robots.txt',
          description: 'Make sure nothing important is blocked.',
          contents: [
            { type: 'text', value: 'Open /robots.txt' },
            { type: 'subItems', value: '', subItems: [{ id: 'st-1', title: 'Disallow rules' }, { id: 'st-2', title: 'Sitemap line' }] },
            { type: 'image', value: 'https://example.com/robots.png', uploadType: 'url' },
          ],
        },
        { id: 't-2', title: 'Check the sitemap', contents: [{ type: 'text', value: 'Submit it' }] },
      ],
    },
  ];

  const editorSaveWithoutTouchingTheOutline = (stored: unknown[]): unknown[] => {
    const loaded = withStableTemplateIdentities(clone(stored));
    const form = normalizeTemplateEditorFormForSave(
      buildTemplateEditorFormValues({ title: 'Technical SEO Audit', sections: loaded }),
    );
    const { sections } = applyTemplateSaveDefaults(form.title, form.sections as ChecklistSection[]);
    return JSON.parse(JSON.stringify(sections)) as unknown[];
  };

  it('treats a save of stored id-less content blocks as unchanged', () => {
    const incoming = editorSaveWithoutTouchingTheOutline(seedSections);
    expect(JSON.stringify(incoming)).toContain('"id":"content_');
    expect(changed(seedSections, incoming)).toBe(false);
  });

  it('treats a save of a Markdown import as unchanged', () => {
    const markdown = renderTemplateMarkdown({ title: 'Technical SEO Audit', sections: seedSections });
    const imported = normalizePortableTemplate(parseTemplateMarkdown(markdown));
    expect(JSON.stringify(imported.sections)).not.toContain('"id"');
    const stored = assignMissingStableTemplateIdentities(imported.sections as unknown[]);
    expect(changed(stored, editorSaveWithoutTouchingTheOutline(stored))).toBe(false);
  });

  type EditorSections = Array<{
    items: Array<{ contents: Array<Record<string, unknown> & { subItems?: Array<Record<string, unknown>> }> }>;
  }>;
  it.each([
    ['a block value changes', (sections: EditorSections) => { sections[0].items[0].contents[0].value = 'Open robots.txt'; }],
    ['blocks are reordered', (sections: EditorSections) => { sections[0].items[0].contents.reverse(); }],
    ['a block is added', (sections: EditorSections) => {
      sections[0].items[1].contents.push({ id: 'content-new', type: 'text', value: 'More' });
    }],
    ['a block is removed', (sections: EditorSections) => { sections[0].items[0].contents.splice(2, 1); }],
    ['a block type changes', (sections: EditorSections) => { sections[0].items[0].contents[2].type = 'text'; }],
    ['a Sub-task id changes', (sections: EditorSections) => {
      sections[0].items[0].contents[1].subItems![0].id = 'st-9';
    }],
    ['a Sub-task title changes', (sections: EditorSections) => {
      sections[0].items[0].contents[1].subItems![1].title = 'Sitemap directive';
    }],
  ])('still reports a change when %s', (_label, mutate) => {
    const incoming = editorSaveWithoutTouchingTheOutline(seedSections) as EditorSections;
    mutate(incoming);
    expect(changed(seedSections, incoming)).toBe(true);
  });
});

describe('omitUnchangedTemplateColumns', () => {
  const stored = {
    title: 'Launch plan',
    description: null,
    type: null,
    seo_title: '',
    seo_description: 'About launches',
    rules: JSON.stringify([{ id: 'rule-1', type: 'required-field', path: 'title', severity: 'error' }]),
    category: '["seo"]',
    tags: '[]',
    slug: 'launch-plan',
    is_public: 0,
  };

  it('drops values that match the stored row', () => {
    expect(omitUnchangedTemplateColumns(stored, {
      title: 'Launch plan',
      description: '',
      type: 'checklist',
      seo_title: '',
      seo_description: 'About launches',
      rules: JSON.stringify([{ severity: 'error', path: 'title', type: 'required-field', id: 'rule-1' }]),
      category: JSON.stringify(['seo']),
      tags: JSON.stringify([]),
      slug: 'launch-plan',
      is_public: false,
    })).toEqual({});
  });

  it('keeps changed values and always keeps items', () => {
    expect(omitUnchangedTemplateColumns(stored, {
      title: 'Launch plan v2',
      is_public: true,
      rules: null,
      items: '[]',
    })).toEqual({ title: 'Launch plan v2', is_public: true, rules: null, items: '[]' });
  });

  it('treats a missing rules column and cleared rules as unchanged', () => {
    expect(omitUnchangedTemplateColumns({ title: 'Launch plan' }, { rules: null })).toEqual({});
  });
});

