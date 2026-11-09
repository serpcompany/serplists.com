import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SaveTemplateInput, SaveTemplateResult } from '@/hooks/useTemplateSave';
import { buildTemplateEditorFormValues } from '@/lib/forms/templateEditorForm';

import { deferred } from '../../../support/deferred';
import { renderSettled } from '../../../support/renderInTheDom';
import { settle } from '../../../support/queryHookProbe';

const getTemplateById = vi.hoisted(() => vi.fn());
const saveTemplate = vi.hoisted(() => vi.fn<(input: SaveTemplateInput) => Promise<SaveTemplateResult>>());
vi.mock('@/lib/api', () => ({ api: { getTemplateById } }));
vi.mock('@/hooks/useTemplateSave', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useTemplateSave')>()),
  useTemplateSave: () => ({ isSaving: false, saveTemplate }),
}));

import { useTemplateEditorModel } from '@/features/template-editor/useTemplateEditorModel';

const storedTemplate = (id: string, title: string, version = 4) => ({
  id,
  title,
  sections: [{ id: 'section-1', title: 'Prep', items: [{ id: 'item-1', title: 'Pick the offer' }] }],
  user_id: 'user-1',
  owner_username: 'alice',
  created_at: '2026-09-01T00:00:00.000Z',
  is_public: false,
  slug: `${id}-slug`,
  version,
});

let unmount: () => void = () => undefined;
beforeEach(() => {
  getTemplateById.mockReset();
  saveTemplate.mockReset();
});
afterEach(() => unmount());

async function openTheEditorAt(id: string | undefined) {
  let model: ReturnType<typeof useTemplateEditorModel> | undefined;
  function Editor({ templateId }: { templateId: string | undefined }) {
    model = useTemplateEditorModel({ id: templateId });
    return null;
  }
  const rendered = await renderSettled(<Editor templateId={id} />);
  unmount = rendered.unmount;
  await act(settle);
  return {
    current: () => {
      if (!model) throw new Error('The editor did not render');
      return model;
    },
    goTo: async (next: string | undefined) => {
      await act(async () => rendered.rerender(<Editor templateId={next} />));
      await act(settle);
    },
  };
}

describe('the template editor loading a saved template', () => {
  it('fills the form from the stored template, with its slug, owner and version', async () => {
    getTemplateById.mockResolvedValue(storedTemplate('template-7', 'Launch plan'));

    const editor = await openTheEditorAt('template-7');

    expect(getTemplateById).toHaveBeenCalledWith('template-7');
    expect(editor.current()).toMatchObject({
      loading: false,
      loadError: null,
      templateSlug: 'template-7-slug',
      ownerSlug: 'alice',
      ownership: { userId: 'user-1', isPublic: false },
      initialValues: { title: 'Launch plan' },
    });
    expect(editor.current().getVersion()).toBe(4);
    editor.current().setVersion(5);
    expect(editor.current().getVersion()).toBe(5);
  });

  it('says why the template could not load', async () => {
    getTemplateById.mockRejectedValueOnce(new Error('Template not found')).mockRejectedValueOnce('offline');

    const editor = await openTheEditorAt('template-7');
    expect(editor.current()).toMatchObject({ loading: false, loadError: 'Template not found' });

    await act(async () => editor.current().reload());
    await act(settle);
    expect(editor.current().loadError).toBe('Failed to load template');
    expect(getTemplateById).toHaveBeenCalledTimes(2);
  });

  it('loads the stored template again when asked to', async () => {
    getTemplateById.mockResolvedValueOnce(storedTemplate('template-7', 'Launch plan', 4));
    getTemplateById.mockResolvedValueOnce(storedTemplate('template-7', 'Launch plan v5', 5));
    const editor = await openTheEditorAt('template-7');

    await act(async () => editor.current().reload());
    await act(settle);

    expect(editor.current().initialValues.title).toBe('Launch plan v5');
    expect(editor.current().getVersion()).toBe(5);
  });

  it('shows the template now opened, not a slower answer for the one before it', async () => {
    const slow = deferred<ReturnType<typeof storedTemplate>>();
    getTemplateById.mockImplementation((id: string) => (id === 'template-7' ? slow.promise : Promise.resolve(storedTemplate(id, 'Checklist B'))));
    const editor = await openTheEditorAt('template-7');

    await editor.goTo('template-8');
    await act(async () => {
      slow.resolve(storedTemplate('template-7', 'Launch plan'));
      await settle();
    });

    expect(editor.current().initialValues.title).toBe('Checklist B');
    expect(editor.current().templateSlug).toBe('template-8-slug');
  });

  it('keeps the template it already loaded when the editor returns to it before the next one loaded', async () => {
    const slow = deferred<ReturnType<typeof storedTemplate>>();
    getTemplateById.mockImplementation((id: string) => (id === 'template-8' ? slow.promise : Promise.resolve(storedTemplate(id, 'Launch plan'))));
    const editor = await openTheEditorAt('template-7');

    await editor.goTo('template-8');
    await editor.goTo('template-7');
    await act(async () => {
      slow.resolve(storedTemplate('template-8', 'Checklist B'));
      await settle();
    });

    expect(getTemplateById).toHaveBeenCalledTimes(2);
    expect(editor.current()).toMatchObject({ loading: false, initialValues: { title: 'Launch plan' }, templateSlug: 'template-7-slug' });
  });

  it('starts a blank form when it moves from a saved template to a new one', async () => {
    getTemplateById.mockResolvedValue(storedTemplate('template-7', 'Launch plan'));
    const editor = await openTheEditorAt('template-7');

    await editor.goTo(undefined);

    expect(editor.current()).toMatchObject({ loading: false, loadError: null, templateSlug: undefined, ownership: undefined, ownerSlug: undefined });
    expect(editor.current().initialValues).toMatchObject({ title: '', description: '' });
    expect(editor.current().initialValues.sections.map((section) => section.title)).toEqual(['']);
    expect(editor.current().getVersion()).toBeUndefined();
  });

  it('marks a save that lands after the editor moved to another template as stale', async () => {
    getTemplateById.mockImplementation(async (id: string) => storedTemplate(id, `Template ${id}`));
    const saved = deferred<SaveTemplateResult>();
    saveTemplate.mockReturnValue(saved.promise);
    const editor = await openTheEditorAt('template-7');

    const saving = editor.current().save(buildTemplateEditorFormValues({
      title: 'Launch plan, edited',
      sections: [{ id: 'section-1', title: 'Prep', items: [{ id: 'item-1', title: 'Pick the offer' }] }],
    }));
    await editor.goTo('template-8');
    saved.resolve({ success: true, errors: [], version: 5 });

    expect(await saving).toMatchObject({ success: true, stale: true });
    expect(saveTemplate.mock.calls.map(([input]) => [input.id, input.expectedVersion])).toEqual([['template-7', 4]]);
  });
});
