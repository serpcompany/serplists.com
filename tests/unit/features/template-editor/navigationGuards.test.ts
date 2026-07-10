import { describe, expect, it, vi } from 'vitest';

import {
  EDITOR_UNSAVED_CHANGES_MESSAGE,
  applyTemplateBeforeUnloadWarning,
  confirmTemplateEditorNavigation,
  shouldBlockTemplateEditorNavigation,
} from '@/features/template-editor/navigationGuards';

describe('template editor navigation guards', () => {
  it('blocks navigation only when there are unsaved changes and no save/load is active', () => {
    expect(
      shouldBlockTemplateEditorNavigation({
        isDirty: true,
        isSaving: false,
        loading: false,
      }),
    ).toBe(true);

    expect(
      shouldBlockTemplateEditorNavigation({
        isDirty: true,
        isSaving: true,
        loading: false,
      }),
    ).toBe(false);

    expect(
      shouldBlockTemplateEditorNavigation({
        isDirty: true,
        isSaving: false,
        loading: true,
      }),
    ).toBe(false);

    expect(
      shouldBlockTemplateEditorNavigation({
        isDirty: false,
        isSaving: false,
        loading: false,
      }),
    ).toBe(false);
  });

  it('uses a confirmation prompt for guarded in-app navigation', () => {
    const confirm = vi.fn(() => false);

    expect(confirmTemplateEditorNavigation(true, confirm)).toBe(false);
    expect(confirm).toHaveBeenCalledWith(EDITOR_UNSAVED_CHANGES_MESSAGE);
  });

  it('allows unguarded navigation without prompting', () => {
    const confirm = vi.fn(() => false);

    expect(confirmTemplateEditorNavigation(false, confirm)).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('applies a browser beforeunload warning only when guarded', () => {
    const guardedEvent = {
      preventDefault: vi.fn(),
      returnValue: undefined as string | undefined,
    };
    const unguardedEvent = {
      preventDefault: vi.fn(),
      returnValue: undefined as string | undefined,
    };

    applyTemplateBeforeUnloadWarning(guardedEvent, true);
    applyTemplateBeforeUnloadWarning(unguardedEvent, false);

    expect(guardedEvent.preventDefault).toHaveBeenCalled();
    expect(guardedEvent.returnValue).toBe('');
    expect(unguardedEvent.preventDefault).not.toHaveBeenCalled();
    expect(unguardedEvent.returnValue).toBeUndefined();
  });
});
