import { describe, expect, it } from 'vitest';
import { firstOf, present, sectionAt, taskAt } from '../../../support/elements';

import { applyTemplateSaveDefaults as applyTemplateDefaults } from '@/hooks/useTemplateValidation';
import {
  buildTemplateEditorFormValues,
  createTemplateEditorContent,
  createTemplateEditorItem,
  createTemplateEditorSubItem,
  templateEditorFormSchema,
  type TemplateEditorContentType,
} from '@/lib/forms/templateEditorForm';
import {
  PORTABLE_TEMPLATE_PACK_SCHEMA_VERSION,
  portableTemplatePackSchema,
} from '@/lib/schemas/checklistSchema';
import { exportPortableTemplatesToJSON, parseTemplatesFromData } from '@/lib/utils/templateBackup';
import type { ChecklistSection, ChecklistTemplate } from '@/types/checklist';

const everyContentTypeTheEditorCanAdd = templateEditorFormSchema.shape.sections.element.shape.items.element.shape.contents
  .unwrap().element.shape.type.options as TemplateEditorContentType[];

const templateTheEditorSavedWithEveryContentTypeBlank = (): ChecklistTemplate => {
  const form = buildTemplateEditorFormValues({ title: 'Launch plan' });
  const item = createTemplateEditorItem();
  item.title = 'Write copy';
  item.contents = everyContentTypeTheEditorCanAdd.map((type) => createTemplateEditorContent(type));
  const subItems = present(item.contents.find((content) => content.type === 'subItems'), 'a Sub-tasks block');
  const trailingBlankSubTask = createTemplateEditorSubItem();
  subItems.subItems = [{ ...createTemplateEditorSubItem(), title: 'Short' }, trailingBlankSubTask];
  sectionAt(form, 0).items = [item];
  const { title, sections } = applyTemplateDefaults(form.title, form.sections as ChecklistSection[]);

  return {
    id: 'template-1',
    title,
    sections,
    userId: 'user-1',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    isPublic: false,
  };
};

const buildPack = (templates: unknown[]) => ({
  kind: 'serplists-template-pack',
  schemaVersion: PORTABLE_TEMPLATE_PACK_SCHEMA_VERSION,
  exportedAt: '2026-09-01T00:00:00.000Z',
  templates,
});

describe('portable template round trip', () => {
  it('exports editor-built templates with every content type the editor can add as a pack its own importer accepts', () => {
    const template = templateTheEditorSavedWithEveryContentTypeBlank();
    const pack = exportPortableTemplatesToJSON([template]);

    expect(portableTemplatePackSchema.safeParse(pack).success).toBe(true);
    expect(sectionAt(firstOf(pack.templates), 0).title).toBe('Section 1');
    expect(sectionAt(firstOf(pack.templates), 0).id).toBe(sectionAt(template, 0).id);

    const parsed = parseTemplatesFromData(JSON.parse(JSON.stringify(pack)));
    expect(parsed.templates).toHaveLength(1);
    const contents = taskAt(firstOf(parsed.templates), 0, 0).contents ?? [];
    expect(contents.map((content) => content.type).sort()).toEqual(['subItems', 'text']);
    expect(contents.find((content) => content.type === 'subItems')?.subItems?.map((subItem) => subItem.title))
      .toEqual(['Short']);
  });

  it('imports packs exported before the fix, with blank titles and empty media', () => {
    const parsed = parseTemplatesFromData(buildPack([
      {
        title: 'Old export',
        sections: [
          {
            id: 'section-1',
            title: '   ',
            items: [
              {
                id: 'item-1',
                title: 'Write copy',
                contents: [
                  { id: 'c-1', type: 'image', value: '' },
                  { id: 'c-2', type: 'subItems', value: '', subItems: [{ id: 'sub-1', title: '' }] },
                ],
              },
            ],
          },
        ],
      },
    ]));

    expect(parsed.templates).toHaveLength(1);
    expect(sectionAt(firstOf(parsed.templates), 0).title).toBe('Section 1');
    expect(taskAt(firstOf(parsed.templates), 0, 0).contents).toEqual([]);
  });

  it('skips an invalid template with a warning instead of rejecting the file', () => {
    const parsed = parseTemplatesFromData(buildPack([
      { title: 'Valid', sections: [{ title: 'Prep', items: [{ title: 'Pack' }] }] },
      { title: 'No tasks', sections: [] },
    ]));

    expect(parsed.templates.map((template) => template.title)).toEqual(['Valid']);
    expect(parsed.warnings).toEqual([
      expect.objectContaining({ templateTitle: 'No tasks', message: expect.stringMatching(/skipped/i) }),
    ]);
  });

  it('still rejects a file when no template in it is valid', () => {
    expect(() => parseTemplatesFromData(buildPack([{ title: 'No tasks', sections: [] }]))).toThrow(/No tasks/);
  });
});
