import { navigation } from '../../../support/mockedNextNavigation';
import { act } from 'react';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TemplateDetailActions } from '@/components/template/TemplateDetailActions';

import { openTheMenu, renderSettled, theInMemoryBrowserAsTheWindow } from '../../../support/renderInTheDom';

theInMemoryBrowserAsTheWindow();

afterEach(cleanup);

type ActionsProps = React.ComponentProps<typeof TemplateDetailActions>;

const hidden = { disabled: true, label: '', visible: false };

async function renderTheActions(overrides: Partial<ActionsProps>) {
  const props: ActionsProps = {
    canDuplicate: true,
    canEdit: true,
    canShare: true,
    canTransfer: false,
    copyButton: hidden,
    editHref: '/dashboard/templates/template-1/edit/',
    exportDisabled: false,
    exportLabel: 'Export',
    isChangingVisibility: false,
    isCloning: false,
    isCreatingShare: false,
    isSignedIn: true,
    loginHref: '/login/?redirect=%2Ftemplates%2Ftemplate-1%2F',
    onClone: vi.fn(),
    onDelete: vi.fn(),
    onExport: vi.fn(),
    onShare: vi.fn(),
    onStartRun: vi.fn(),
    onTransfer: vi.fn(),
    runsHref: null,
    showStartRun: false,
    ...overrides,
  };
  navigation.reset('/dashboard/templates/template-1/');
  await renderSettled(<TemplateDetailActions {...props} />);
  return props;
}

const visibleControls = () =>
  [...screen.queryAllByRole('button'), ...screen.queryAllByRole('link')].map((control) => control.textContent);

describe('the actions on a Template detail page', () => {
  it('says Creating... on Share while the share link is being made', async () => {
    await renderTheActions({ isCreatingShare: true });

    expect(screen.getByRole('button', { name: 'Creating...' })).toBeTruthy();
  });

  it('offers Edit without Share when the Template cannot be shared', async () => {
    await renderTheActions({ canShare: false });

    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Edit' }).getAttribute('href')).toBe('/dashboard/templates/template-1/edit/');
  });

  it('offers nothing to copy to a signed-in visitor who cannot copy the Template', async () => {
    await renderTheActions({ canEdit: false });

    expect(visibleControls()).toEqual([]);
  });

  it('asks a signed-out visitor to log in to copy the Template', async () => {
    await renderTheActions({
      canEdit: false,
      isSignedIn: false,
      copyButton: { disabled: false, label: 'Copy to My Templates', visible: true },
    });

    expect(screen.getByRole('link', { name: 'Log in to copy template' }).getAttribute('href')).toBe(
      '/login/?redirect=%2Ftemplates%2Ftemplate-1%2F',
    );
  });

  it('offers a signed-out visitor nothing when the Template cannot be copied', async () => {
    await renderTheActions({ canEdit: false, isSignedIn: false });

    expect(visibleControls()).toEqual([]);
  });

  it('links to the runs of the Template and starts one', async () => {
    const props = await renderTheActions({ runsHref: '/dashboard/runs/?template=template-1', showStartRun: true });

    expect(screen.getByRole('link', { name: 'View runs' }).getAttribute('href')).toBe('/dashboard/runs/?template=template-1');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Start Run' }));
    });
    expect(props.onStartRun).toHaveBeenCalledTimes(1);
  });

  it('offers Transfer to Organization in the menu when the Template can move', async () => {
    const props = await renderTheActions({ canTransfer: true });

    const items = await openTheMenu('Template actions');
    expect(items.map((item) => item.textContent)).toEqual(['Duplicate', 'Export', 'Transfer to Organization', 'Delete']);

    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Transfer to Organization' }));
    });
    expect(props.onTransfer).toHaveBeenCalledTimes(1);
  });

  it('leaves Transfer and Duplicate out of the menu when neither applies', async () => {
    await renderTheActions({ canDuplicate: false });

    const items = await openTheMenu('Template actions');

    expect(items.map((item) => item.textContent)).toEqual(['Export', 'Delete']);
  });
});
