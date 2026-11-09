import '../../../support/mockedToasts';
import '../../../support/cleanupAfterEachTest';
import '../../../support/mockedClipboard';
import { navigation } from '../../../support/mockedNextNavigation';
import { act } from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { toast } from 'sonner';
import { describe, expect, it, vi } from 'vitest';

import { PublicTemplateView } from '@/components/template/PublicTemplateView';
import { copyTextToClipboard } from '@/lib/clipboard';

import { publicTemplateViewProps, weddingTemplate, type PublicTemplateViewProps } from '../../../fixtures/publicTemplateView';
import { renderSettled, theInMemoryBrowserAsTheWindow } from '../../../support/renderInTheDom';

theInMemoryBrowserAsTheWindow();

const renderTheView = (overrides: Partial<PublicTemplateViewProps> = {}) => {
  navigation.reset('/profile/devinschumacher/complete-wedding-planning-checklist/');
  return renderSettled(<PublicTemplateView {...publicTemplateViewProps(overrides)} />);
};

const press = (element: HTMLElement) =>
  act(async () => {
    fireEvent.click(element);
  });

describe('the public Template page actions', () => {
  it('copies the page address with Share', async () => {
    vi.mocked(copyTextToClipboard).mockResolvedValue(true);
    await renderTheView();

    await press(screen.getByRole('button', { name: 'Share' }));

    expect(copyTextToClipboard).toHaveBeenCalledWith(window.location.href);
    expect(toast.success).toHaveBeenCalledWith('Link copied to clipboard');
  });

  it('says to copy from the address bar when the clipboard refuses', async () => {
    vi.mocked(copyTextToClipboard).mockResolvedValue(false);
    await renderTheView();

    await press(screen.getByRole('button', { name: 'Share' }));

    expect(toast.error).toHaveBeenCalledWith("Couldn't copy the link. Copy it from the address bar.");
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('shows Saved once a save succeeds', async () => {
    const onSaveTemplate = vi.fn(async () => true);
    await renderTheView({ isProUser: true, onSaveTemplate });

    await press(screen.getByRole('button', { name: 'Save' }));

    expect(onSaveTemplate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Saved' })).toBeTruthy();
  });

  it('keeps offering Save from the banner after a save that failed', async () => {
    const onSaveTemplate = vi.fn(async () => Promise.reject(new Error('offline')));
    await renderTheView({ isProUser: true, onSaveTemplate });

    await press(screen.getByRole('button', { name: 'Copy to Library' }));

    expect(onSaveTemplate).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Saved' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
  });
});

describe('the public Template page details', () => {
  it('tells a role that can only add Templates that it cannot start runs', async () => {
    await renderTheView({ canStartRun: false });

    expect(
      screen.getByText('Save it to your library for later. Your role in this Organization cannot start runs.'),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Start Run' })).toBeNull();
  });

  it('shows a recipe with an owner that has no Public Profile and no name it can draw initials from', async () => {
    await renderTheView({
      ownerPath: null,
      template: { ...weddingTemplate, type: 'recipe', description: '', ownerProfile: { full_name: '—' } },
    });

    expect(screen.getByText('—').closest('a')).toBeNull();
    expect(screen.getByText('U')).toBeTruthy();
    expect(screen.getByText('recipe')).toBeTruthy();
  });

  it('names a Template with no owner after the Template Library and calls a Template with no type a checklist', async () => {
    const { type, ...untyped } = weddingTemplate;
    await renderTheView({ template: { ...untyped, tags: ['outdoor', 'budget'] } });

    expect(screen.getAllByText('Template Library').length).toBeGreaterThan(1);
    expect(screen.getByText('T')).toBeTruthy();
    expect(screen.getByText('checklist')).toBeTruthy();
    expect(screen.getByText('#outdoor')).toBeTruthy();
    expect(screen.getByText('#budget')).toBeTruthy();
  });
});
