import { describe, expect, it } from 'vitest';
import { elementAt, firstOf, present, subTaskAt, taskIn } from '../../../support/elements';

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
import { storedSections, storedSectionsAsTheEditorResendsThem } from '../../../fixtures/editorResentSections';
import { storedSections as storedSectionsSchema, type StoredSections } from '../../../support/storedJson';

const blocksOf = (sections: StoredSections, task: number) => present(taskIn(sections, 0, task).contents, 'the blocks of the task');

const clone = <T>(value: T): T => structuredClone(value);
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
    ['an item title is renamed', (sections: StoredSections) => { taskIn(sections, 0, 1).title = 'Ship'; }],
    ['items are reordered', (sections: StoredSections) => { firstOf(sections).items.reverse(); }],
    ['an item is added', (sections: StoredSections) => {
      firstOf(sections).items.push({ id: 'item-3', title: 'Announce' });
    }],
    ['a sub-item is added under contents', (sections: StoredSections) => {
      present(firstOf(blocksOf(sections, 0)).subItems, 'the sub-tasks').push({ title: 'Long', id: 'sub-2', isCompleted: false });
    }],
    ['a description changes', (sections: StoredSections) => { taskIn(sections, 0, 0).description = 'Draft and edit'; }],
  ])('reports a change when %s', (_label, mutate) => {
    const incoming = storedSectionsSchema.parse(clone(storedSectionsAsTheEditorResendsThem));
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
    return structuredClone(sections);
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

  it.each([
    ['a block value changes', (sections: StoredSections) => { firstOf(blocksOf(sections, 0)).value = 'Open robots.txt'; }],
    ['blocks are reordered', (sections: StoredSections) => { blocksOf(sections, 0).reverse(); }],
    ['a block is added', (sections: StoredSections) => {
      blocksOf(sections, 1).push({ id: 'content-new', type: 'text', value: 'More' });
    }],
    ['a block is removed', (sections: StoredSections) => { blocksOf(sections, 0).splice(2, 1); }],
    ['a block type changes', (sections: StoredSections) => { elementAt(blocksOf(sections, 0), 2).type = 'text'; }],
    ['a Sub-task id changes', (sections: StoredSections) => {
      subTaskAt(elementAt(blocksOf(sections, 0), 1), 0).id = 'st-9';
    }],
    ['a Sub-task title changes', (sections: StoredSections) => {
      subTaskAt(elementAt(blocksOf(sections, 0), 1), 1).title = 'Sitemap directive';
    }],
  ])('still reports a change when %s', (_label, mutate) => {
    const incoming = storedSectionsSchema.parse(editorSaveWithoutTouchingTheOutline(seedSections));
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

