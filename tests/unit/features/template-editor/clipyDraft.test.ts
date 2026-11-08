import { afterEach, describe, expect, it, vi } from 'vitest';

import { generateTemplateDraftFromClipy } from '@/features/template-editor/clipyDraft';
import { ApiError } from '@/lib/api-errors';
import { buildTemplateEditorFormValues } from '@/lib/forms/templateEditorForm';

const draft = buildTemplateEditorFormValues({
  title: 'Launch a landing page',
  sections: [{ id: 'section-1', title: 'Plan', items: [{ id: 'item-1', title: 'Pick the offer' }] }],
});

describe('Generate from Clipy in the template editor', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the Clipy link and fills the form with the draft the server made from it', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ draft }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const generated = await generateTemplateDraftFromClipy('https://clipy.example/v/launch');

    expect(generated.draft.title).toBe('Launch a landing page');
    expect(generated.draft.sections.map((section) => section.items.map((item) => item.title))).toEqual([['Pick the offer']]);
    const [input, init] = fetchMock.mock.calls[0] ?? [];
    expect(new URL(String(input), 'http://localhost').pathname).toMatch(/\/templates\/generate-from-clipy$/);
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(JSON.stringify({ url: 'https://clipy.example/v/launch' }));
  });

  it('refuses an answer that is not a draft', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ draft: { title: 7 } }), { status: 200 })));

    await expect(generateTemplateDraftFromClipy('https://clipy.example/v/launch')).rejects.toBeInstanceOf(ApiError);
  });
});
