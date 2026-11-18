import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  confirmReplaceTemplateDraft,
  restoreKeptTemplateDraft,
} from '@/features/template-editor/navigationGuards';

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the template editor's questions before it replaces the form, asked with the browser's confirm", () => {
  it('replaces typed work with a generated draft only when the person agrees', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);

    expect(confirmReplaceTemplateDraft(true)).toBe(false);
    expect(confirmReplaceTemplateDraft(true)).toBe(true);
    const question = 'Replace your template with the draft generated from Clipy? Your unsaved changes will be lost.';
    expect(confirm.mock.calls).toEqual([[question], [question]]);
  });

  it('restores a kept draft over typed work only when the person agrees', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    const apply = vi.fn();

    expect(restoreKeptTemplateDraft({ hasUnsavedWork: true, takeDraft: () => 'kept', apply })).toBe(false);
    expect(apply).not.toHaveBeenCalled();
    expect(restoreKeptTemplateDraft({ hasUnsavedWork: true, takeDraft: () => 'kept', apply })).toBe(true);
    expect(apply).toHaveBeenCalledWith('kept');
    const question = 'Replace your template with the kept draft? Your unsaved changes will be lost.';
    expect(confirm.mock.calls).toEqual([[question], [question]]);
  });
});
