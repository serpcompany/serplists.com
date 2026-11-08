import { act, useState } from 'react';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TransferTemplateDialog } from '@/components/template/TransferTemplateDialog';

import { renderSettled, theInMemoryBrowserAsTheWindow } from '../../../support/renderInTheDom';
import { chooseTheOption } from '../../../support/selectOptions';

theInMemoryBrowserAsTheWindow();

afterEach(cleanup);

const organizations = [
  { id: 'org-acme', name: 'Acme' },
  { id: 'org-beta', name: 'Beta' },
];

async function renderTheDialog() {
  const onConfirm = vi.fn<(teamId: string) => void>();
  function Page() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          Transfer to Organization
        </button>
        <TransferTemplateDialog
          isPublic={false}
          onConfirm={onConfirm}
          onOpenChange={setOpen}
          open={open}
          organizations={organizations}
          pending={false}
          templateTitle="Launch Playbook"
        />
      </>
    );
  }
  await renderSettled(<Page />);
  return onConfirm;
}

async function openTheDialog(): Promise<HTMLElement> {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Transfer to Organization' }));
  });
  return screen.getByRole('dialog', { name: 'Transfer to Organization' });
}

const chooseOrganization = (name: string) => chooseTheOption('Organization', name);

const transferIn = (dialog: HTMLElement) =>
  act(async () => {
    fireEvent.click(within(dialog).getByRole('button', { name: 'Transfer' }));
  });

describe('the Transfer to Organization dialog', () => {
  it('transfers to the Organization picked from the list', async () => {
    const onConfirm = await renderTheDialog();

    const dialog = await openTheDialog();
    await chooseOrganization('Beta');
    await waitFor(() => {
      expect(within(dialog).getByRole('combobox', { name: 'Organization' }).textContent).toContain('Beta');
    });
    await transferIn(dialog);

    expect(onConfirm).toHaveBeenCalledWith('org-beta');
  });

  it('closes on Cancel and starts again from the first Organization when reopened', async () => {
    const onConfirm = await renderTheDialog();

    const dialog = await openTheDialog();
    await chooseOrganization('Beta');
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    const reopened = await openTheDialog();
    await transferIn(reopened);

    expect(onConfirm).toHaveBeenCalledWith('org-acme');
  });
});
