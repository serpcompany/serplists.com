import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { templateToolDefinitions } from '@functions/api/handlers/agentMcpTemplateTools';
import { checklistItemContentSchema, portableChecklistItemContentSchema } from '@/lib/schemas/checklistSchema';
import { normalizePortableSections } from '@/lib/schemas/portableTemplateNormalize';
import { CHECKLIST_CONTENT_TYPES } from '@/lib/schemas/storedSections';
import { templateEditorFormSchema } from '@/lib/forms/templateEditorForm';
import { normalizeSections } from '@/lib/utils/checklistSections';
import type { ChecklistItemContent } from '@/types/checklist';
import { sectionRecordsIn, taskRecordsIn } from '@/lib/schemas/jsonRecords';
import { firstOf, taskIn } from '../../../support/elements';

const sorted = (types: readonly string[]) => [...types].sort();

const typeOf = z.object({ type: z.string() }).passthrough();

const createTemplateContentsSchema = z.object({
  inputSchema: z.object({
    properties: z.object({
      sections: z.object({
        items: z.object({
          properties: z.object({
            items: z.object({
              items: z.object({
                properties: z.object({
                  contents: z.object({
                    items: z.object({ properties: z.object({ type: z.object({ enum: z.array(z.string()) }) }) }),
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    }),
  }),
});

const SAMPLE_OF_EVERY_TYPE: Record<ChecklistItemContent['type'], ChecklistItemContent> = {
  text: { id: 'c-text', type: 'text', value: 'Body' },
  image: { id: 'c-image', type: 'image', value: 'https://example.com/a.png' },
  video: { id: 'c-video', type: 'video', value: 'https://example.com/a.mp4' },
  file: { id: 'c-file', type: 'file', value: 'https://example.com/a.pdf' },
  embed: { id: 'c-embed', type: 'embed', value: 'https://example.com/embed' },
  subItems: { id: 'c-sub', type: 'subItems', value: '', subItems: [{ id: 's1', title: 'One' }] },
  form: { id: 'c-form', type: 'form', value: '', fields: [{ id: 'f1', label: 'Name', kind: 'text', required: true }] },
};

const sectionsHolding = (contents: unknown[]) => [{ id: 's1', title: 'S', items: [{ id: 'i1', title: 'T', contents }] }];

describe('every copy of the content block type list agrees with CHECKLIST_CONTENT_TYPES', () => {
  const expected = sorted(CHECKLIST_CONTENT_TYPES);

  it('in the stored, legacy and portable schemas', () => {
    expect(sorted(checklistItemContentSchema.shape.type.options)).toEqual(expected);
    expect(sorted(portableChecklistItemContentSchema.options.map((option) => option.shape.type.value))).toEqual(expected);
  });

  it('in the template editor form', () => {
    const contentSchema = templateEditorFormSchema.shape.sections.element.shape.items.element.shape.contents.unwrap().element;
    expect(sorted(contentSchema.shape.type.options)).toEqual(expected);
  });

  it('in the MCP template tools', () => {
    const createTemplate = templateToolDefinitions.find((tool) => tool.name === 'create_template');
    const parsed = createTemplateContentsSchema.parse(createTemplate);
    const contentTypes = parsed.inputSchema.properties.sections.items.properties.items.items.properties.contents.items.properties.type.enum;
    expect(sorted(contentTypes)).toEqual(expected);
  });

  it('in the portable import normalizer and the run page normalizer, which keep a block of every type', () => {
    const samples = Object.values(SAMPLE_OF_EVERY_TYPE);
    const portable = firstOf(taskRecordsIn(firstOf(sectionRecordsIn(normalizePortableSections(sectionsHolding(samples)))).items));
    const portableTypes = z.array(typeOf).parse(portable.contents);
    expect(sorted(portableTypes.map((content) => content.type))).toEqual(expected);

    const shown = taskIn(normalizeSections(sectionsHolding(samples)), 0, 0).contents ?? [];
    expect(sorted(shown.map((content) => content.type))).toEqual(expected);
  });
});
