import { clickTheButton, renderTheTemplateEditorPanels, thePanelHeading } from '../../../support/templateEditorPanels';
import { act } from 'react';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EDITOR_PANEL_ID } from '@/components/template-editor/editorPanelIds';

const scrolledInto = vi.fn<(element: Element) => void>();

beforeEach(() => {
  vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(function (this: Element) {
    scrolledInto(this);
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  scrolledInto.mockReset();
});

const launch = {
  title: 'Launch',
  sections: [{ id: 'section-1', title: 'Prepare', items: [{ id: 'task-1', title: 'Write notes', contents: [] }] }],
};

async function openTheOutline(): Promise<HTMLElement> {
  screen.getByRole('button', { name: 'Open outline' }).focus();
  await clickTheButton('Open outline');
  return screen.findByRole('dialog', { name: 'Outline' });
}

async function pickInTheSheet(name: string) {
  const sheet = await openTheOutline();
  await act(async () => {
    fireEvent.click(within(sheet).getByRole('button', { name }));
  });
}

describe('the template editor outline in a sheet on narrow screens', () => {
  it('closes after an entry is picked, then scrolls to the panel and focuses its heading', async () => {
    await renderTheTemplateEditorPanels(launch, { besideForm: false });

    await pickInTheSheet('Write notes');

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Outline' })).toBeNull();
    });
    expect(thePanelHeading()).toBe('Task Details');
    await waitFor(() => {
      expect(scrolledInto).toHaveBeenCalledWith(document.getElementById(EDITOR_PANEL_ID));
    });
    expect(document.activeElement?.textContent).toBe('Task Details');
  });

  it('returns focus to what opened it, without scrolling, when closed without a pick', async () => {
    await renderTheTemplateEditorPanels(launch, { besideForm: false });

    const sheet = await openTheOutline();
    await act(async () => {
      fireEvent.keyDown(sheet, { key: 'Escape' });
    });

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Outline' })).toBeNull();
    });
    await waitFor(() => {
      expect(document.activeElement?.textContent).toBe('Open outline');
    });
    expect(scrolledInto).not.toHaveBeenCalled();
    expect(thePanelHeading()).toBe('Template Settings');
  });

  it('keeps the picked mode when the sheet is opened again', async () => {
    await renderTheTemplateEditorPanels(launch, { besideForm: false });

    await pickInTheSheet('Search & SEO');
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Outline' })).toBeNull();
    });
    await waitFor(() => {
      expect(scrolledInto).toHaveBeenCalledWith(document.getElementById(EDITOR_PANEL_ID));
    });
    scrolledInto.mockReset();

    const reopened = await openTheOutline();
    await act(async () => {
      fireEvent.keyDown(reopened, { key: 'Escape' });
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Outline' })).toBeNull();
    });

    expect(thePanelHeading()).toBe('Search & SEO');
    expect(scrolledInto).not.toHaveBeenCalled();
  });
});
