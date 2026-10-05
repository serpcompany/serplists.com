import React, { act } from 'react';
import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderSettled, theInMemoryBrowserAsTheWindow } from '../../../support/renderInTheDom';
import { toast } from 'sonner';

import { TransferTemplateDialog } from '@/components/template/TransferTemplateDialog';
import type { TemplateDetailActionResult } from '@/features/template-detail/templateDetailApi';
import { transferTargetsFor, useTemplateTransfer } from '@/features/template-detail/useTemplateTransfer';
import type { TeamSummary } from '@/lib/schemas/teamResponses';
import type { ChecklistTemplate } from '@/types/checklist';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

theInMemoryBrowserAsTheWindow();

const membership = (id: string, name: string, role: TeamSummary['role'], membershipStatus: TeamSummary['membershipStatus'] = 'active'): TeamSummary => ({
  id,
  name,
  slug: id,
  role,
  membershipStatus,
  memberId: `member-${id}`,
});

const ORGANIZATIONS = [
  membership('org-viewer', 'Viewer Org', 'viewer'),
  membership('org-acme', 'Acme', 'editor'),
  membership('org-runner', 'Runner Org', 'runner'),
  membership('org-left', 'Disabled Org', 'owner', 'disabled'),
  membership('org-beta', 'Beta', 'owner'),
];

type Transferable = Pick<ChecklistTemplate, 'isPublic' | 'ownerType' | 'teamId' | 'title' | 'userId'>;
const personalTemplate: Transferable = { isPublic: false, ownerType: 'user', teamId: undefined, title: 'Launch Playbook', userId: 'user-1' };

const loginRequired = vi.fn();
const navigate = vi.fn();

function TransferHarness(props: {
  organizations?: readonly TeamSummary[];
  template?: Transferable;
  transfer: (teamId: string) => Promise<TemplateDetailActionResult>;
}) {
  const transfer = useTemplateTransfer({
    beginVisit: () => ({ isCurrent: () => true }),
    loginRequired,
    navigate,
    organizations: props.organizations ?? ORGANIZATIONS,
    template: props.template ?? personalTemplate,
    transfer: props.transfer,
    userId: 'user-1',
  });
  return (
    <>
      {transfer.canTransfer ? (
        <button onClick={transfer.openDialog} type="button">
          Transfer to Organization
        </button>
      ) : null}
      <TransferTemplateDialog {...transfer.dialog} />
    </>
  );
}

const openTheTransferDialog = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Transfer to Organization' }));
  });
  return screen.getByRole('dialog', { name: 'Transfer to Organization' });
};

const clickTransfer = (dialog: HTMLElement) =>
  act(async () => {
    fireEvent.click(within(dialog).getByRole('button', { name: /^Transfer/ }));
  });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Transfer to Organization on a Template page', () => {
  it('offers only active Organizations where the user can add Templates', () => {
    expect(transferTargetsFor(ORGANIZATIONS).map((organization) => organization.name)).toEqual(['Acme', 'Beta']);
  });

  it('is offered only for your own Personal Template, and only when some Organization can take it', async () => {
    const transfer = vi.fn();
    const offered = async (props: Partial<React.ComponentProps<typeof TransferHarness>>) => {
      const { unmount } = await renderSettled(<TransferHarness transfer={transfer} {...props} />);
      const shown = screen.queryByRole('button', { name: 'Transfer to Organization' }) !== null;
      unmount();
      return shown;
    };

    expect(await offered({})).toBe(true);
    expect(await offered({ template: { ...personalTemplate, ownerType: 'team', teamId: 'org-acme' } })).toBe(false);
    expect(await offered({ template: { ...personalTemplate, userId: 'user-2' } })).toBe(false);
    expect(await offered({ organizations: [membership('org-viewer', 'Viewer Org', 'viewer')] })).toBe(false);
  });

  it('transfers to the first eligible Organization, warns about existing Runs first, and says where the Template went', async () => {
    let finish: (result: TemplateDetailActionResult) => void = () => {};
    const transfer = vi.fn(() => new Promise<TemplateDetailActionResult>((resolve) => { finish = resolve; }));
    await renderSettled(<TransferHarness transfer={transfer} />);

    const dialog = await openTheTransferDialog();
    expect(within(dialog).getByRole('combobox', { name: 'Organization' }).textContent).toContain('Acme');
    expect(dialog.textContent).toContain('Runs you already started from it stay in Personal and no longer receive its changes.');
    await clickTransfer(dialog);

    expect(transfer).toHaveBeenCalledWith('org-acme');
    const pendingButton = within(dialog).getByRole('button', { name: 'Transferring...' });
    expect(pendingButton.hasAttribute('disabled')).toBe(true);
    await clickTransfer(dialog);
    expect(transfer).toHaveBeenCalledTimes(1);

    await act(async () => {
      finish({ kind: 'ok', templateId: 'tpl-1', teamId: 'org-acme' });
    });

    expect(toast.success).toHaveBeenCalledWith('Template transferred to Acme');
    expect(navigate).toHaveBeenCalledWith('/dashboard/organization/org-acme/templates/tpl-1/');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps the dialog open with the reason when the transfer is refused, so the user can pick another Organization', async () => {
    const transfer = vi.fn().mockResolvedValue({ kind: 'error', message: 'This Organization has reached its Template limit.' });
    await renderSettled(<TransferHarness transfer={transfer} />);

    const dialog = await openTheTransferDialog();
    await clickTransfer(dialog);

    expect(toast.error).toHaveBeenCalledWith('This Organization has reached its Template limit.');
    expect(toast.success).not.toHaveBeenCalled();
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Transfer' })).toBeTruthy();
  });

  it('transfers a public Template too, saying first that its public page moves and its current link redirects', async () => {
    const transfer = vi.fn().mockResolvedValue({ kind: 'ok', templateId: 'tpl-1', teamId: 'org-acme' });
    await renderSettled(<TransferHarness template={{ ...personalTemplate, isPublic: true }} transfer={transfer} />);

    const dialog = await openTheTransferDialog();
    expect(dialog.textContent).toContain("Its public page moves to the Organization's profile, and its current link redirects there.");
    await clickTransfer(dialog);

    expect(transfer).toHaveBeenCalledWith('org-acme');
    expect(navigate).toHaveBeenCalledWith('/dashboard/organization/org-acme/templates/tpl-1/');
  });
});
