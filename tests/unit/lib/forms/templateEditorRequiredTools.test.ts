import { describe, expect, it, vi } from 'vitest';

import { saveTemplateEditorData } from '@/features/template-editor/useTemplateEditorModel';
import { buildTemplateEditorFormValues } from '@/lib/forms/templateEditorForm';
import {
  createTemplateEditorRequiredTool,
  findTemplateEditorRequiredToolsIssues,
  normalizeTemplateEditorRequiredTools,
} from '@/lib/forms/templateEditorRequiredTools';
import { REQUIRED_TOOLS_MAX } from '@/lib/schemas/requiredTools';
import { buildTemplateUpdateRequest } from '@/lib/templates/templateUpdate';

const timer = { name: 'Time tracker', url: 'https://example.com/track', required: true };
const blank = createTemplateEditorRequiredTool();

describe('the Required tools the Template editor saves', () => {
  it('starts a new tool blank and required', () => {
    expect(blank).toEqual({ name: '', url: '', required: true });
  });

  it('drops tools left blank and trims the rest', () => {
    expect(normalizeTemplateEditorRequiredTools([blank, { name: '  Time tracker ', url: ' https://example.com/track ', required: false }, { ...blank, name: '  ' }]))
      .toEqual([{ name: 'Time tracker', url: 'https://example.com/track', required: false }]);
  });

  it('names the tool by its place in the list when its name or URL cannot be saved', () => {
    expect(findTemplateEditorRequiredToolsIssues([
      blank,
      { ...blank, url: 'https://example.com' },
      { ...timer, url: 'example.com/track' },
      { ...timer, url: 'https://example.com/time tracker' },
      timer,
    ])).toEqual([
      'Required tools: give tool 2 a name.',
      "Required tools: tool 3's URL must start with http:// or https:// and have no spaces.",
      "Required tools: tool 4's URL must start with http:// or https:// and have no spaces.",
    ]);
  });

  it(`refuses more than ${REQUIRED_TOOLS_MAX} tools, and accepts a list it can save`, () => {
    expect(findTemplateEditorRequiredToolsIssues(Array.from({ length: REQUIRED_TOOLS_MAX + 1 }, () => timer)))
      .toEqual([`Required tools: use ${REQUIRED_TOOLS_MAX} or fewer.`]);
    expect(findTemplateEditorRequiredToolsIssues([timer, blank])).toEqual([]);
  });

  it('refuses a save with a tool it cannot store, before the request', async () => {
    const saveTemplate = vi.fn();

    const result = await saveTemplateEditorData(
      { id: 't1', expectedVersion: 2, values: buildTemplateEditorFormValues({ title: 'Launch', requiredTools: [{ ...timer, url: 'ftp://example.com' }] }) },
      { saveTemplate },
    );

    expect(result).toEqual({
      success: false,
      errors: [{ type: 'validation', message: "Required tools: tool 1's URL must start with http:// or https:// and have no spaces." }],
    });
    expect(saveTemplate).not.toHaveBeenCalled();
  });

  it('saves the tools it kept, which the update request sends to the API', async () => {
    const saveTemplate = vi.fn().mockResolvedValue({ success: true, errors: [] });

    await saveTemplateEditorData(
      { id: 't1', expectedVersion: 2, values: buildTemplateEditorFormValues({ title: 'Launch', requiredTools: [timer, blank] }) },
      { saveTemplate },
    );

    expect(saveTemplate).toHaveBeenCalledWith(expect.objectContaining({ requiredTools: [timer] }));
    expect(buildTemplateUpdateRequest({ id: 't1', title: 'Launch', sections: [], requiredTools: [timer], version: 2 }))
      .toMatchObject({ requiredTools: [timer], expected_version: 2 });
  });

  it('sends an empty list once every tool is removed, so a save clears them', async () => {
    const saveTemplate = vi.fn().mockResolvedValue({ success: true, errors: [] });

    await saveTemplateEditorData({ id: 't1', expectedVersion: 2, values: buildTemplateEditorFormValues({ title: 'Launch' }) }, { saveTemplate });

    expect(saveTemplate).toHaveBeenCalledWith(expect.objectContaining({ requiredTools: [] }));
  });
});
