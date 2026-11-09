import { act } from 'react';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GenerateFromClipy } from '@/components/template-editor/GenerateFromClipy';
import { api } from '@/lib/api';
import { buildTemplateEditorFormValues, type TemplateEditorFormValues } from '@/lib/forms/templateEditorForm';

import { deferred } from '../../../support/deferred';
import { inputNamed, renderSettled, typeInto } from '../../../support/renderInTheDom';

vi.mock('@/lib/api', () => ({ api: { generateTemplateFromClipy: vi.fn() } }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const draft = buildTemplateEditorFormValues({ title: 'From the recording' });
const link = 'https://clipy.online/video/abc';

async function renderTheGenerator() {
  const onGenerated = vi.fn<(values: TemplateEditorFormValues) => void>();
  await renderSettled(<GenerateFromClipy onGenerated={onGenerated} confirmReplace={() => true} />);
  await typeInto(inputNamed('Public Clipy video link'), link);
  return onGenerated;
}

const pressEnterInTheLink = () =>
  act(async () => {
    fireEvent.keyDown(inputNamed('Public Clipy video link'), { key: 'Enter' });
  });

describe('Generate from Clipy in the new Template editor', () => {
  it('asks the API for a draft when Enter is pressed in the link, locking the link while it waits', async () => {
    const reply = deferred<{ draft: TemplateEditorFormValues }>();
    vi.mocked(api.generateTemplateFromClipy).mockReturnValue(reply.promise);
    const onGenerated = await renderTheGenerator();

    await pressEnterInTheLink();

    expect(api.generateTemplateFromClipy).toHaveBeenCalledWith(link);
    expect(screen.getByRole('button', { name: 'Generating…' })).toHaveProperty('disabled', true);
    expect(inputNamed('Public Clipy video link').disabled).toBe(true);

    await act(async () => {
      reply.resolve({ draft });
      await reply.promise;
    });

    expect(onGenerated).toHaveBeenCalledWith(draft);
    expect(screen.getByRole('button', { name: 'Generate draft' })).toHaveProperty('disabled', false);
  });

  it('leaves the link as typed on keys other than Enter', async () => {
    await renderTheGenerator();

    await act(async () => {
      fireEvent.keyDown(inputNamed('Public Clipy video link'), { key: 'a' });
    });

    expect(api.generateTemplateFromClipy).not.toHaveBeenCalled();
  });

  it("shows the API's message when the draft cannot be made", async () => {
    vi.mocked(api.generateTemplateFromClipy).mockRejectedValue(new Error('That recording is private.'));
    const onGenerated = await renderTheGenerator();

    await pressEnterInTheLink();

    expect(screen.getByRole('alert').textContent).toBe('That recording is private.');
    expect(onGenerated).not.toHaveBeenCalled();
  });

  it('shows a general message when the failure carries none', async () => {
    vi.mocked(api.generateTemplateFromClipy).mockRejectedValue('offline');
    await renderTheGenerator();

    await pressEnterInTheLink();

    expect(screen.getByRole('alert').textContent).toBe('Unable to generate a template from this Clipy recording.');
  });

  it('shows no error from a request that fails after the editor closed', async () => {
    const reply = deferred<{ draft: TemplateEditorFormValues }>();
    vi.mocked(api.generateTemplateFromClipy).mockReturnValue(reply.promise);
    await renderTheGenerator();
    await pressEnterInTheLink();

    cleanup();
    await act(async () => {
      reply.reject(new Error('Too late'));
      await reply.promise.catch(() => undefined);
    });

    expect(screen.queryByRole('alert')).toBeNull();
  });
});
