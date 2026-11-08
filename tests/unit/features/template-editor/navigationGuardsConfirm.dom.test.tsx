import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  confirmReplaceTemplateDraft,
  EDITOR_REPLACE_DRAFT_MESSAGE,
  EDITOR_RESTORE_DRAFT_MESSAGE,
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
    expect(confirm.mock.calls).toEqual([[EDITOR_REPLACE_DRAFT_MESSAGE], [EDITOR_REPLACE_DRAFT_MESSAGE]]);
  });

  it('restores a kept draft over typed work only when the person agrees', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    const apply = vi.fn();

    expect(restoreKeptTemplateDraft({ hasUnsavedWork: true, takeDraft: () => 'kept', apply })).toBe(false);
    expect(apply).not.toHaveBeenCalled();
    expect(restoreKeptTemplateDraft({ hasUnsavedWork: true, takeDraft: () => 'kept', apply })).toBe(true);
    expect(apply).toHaveBeenCalledWith('kept');
    expect(confirm.mock.calls).toEqual([[EDITOR_RESTORE_DRAFT_MESSAGE], [EDITOR_RESTORE_DRAFT_MESSAGE]]);
  });
});
