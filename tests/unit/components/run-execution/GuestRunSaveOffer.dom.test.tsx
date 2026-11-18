import { act } from 'react';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GuestRunSaveOffer } from '@/components/run-execution/GuestRunSaveActions';

import { buildRun } from '../../../fixtures/runExecutionFixtures';
import { renderSettled } from '../../../support/renderInTheDom';

const saving = vi.hoisted(() => ({ isSaving: false, isWorkspaceLoading: false, save: vi.fn(async () => undefined) }));

vi.mock('@/features/guest-runs/useSaveGuestRunToAccount', () => ({
  useSaveGuestRunToAccount: () => ({ isSaving: saving.isSaving, save: saving.save }),
}));
vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: () => ({ isWorkspaceLoading: saving.isWorkspaceLoading }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  saving.isSaving = false;
  saving.isWorkspaceLoading = false;
});

const { sections } = buildRun();
const template = {
  id: 'template-1',
  title: 'Launch checklist',
  sections,
  userId: 'user-2',
  isPublic: true,
  createdAt: '2026-04-18T00:00:00.000Z',
  updatedAt: '2026-04-18T00:00:00.000Z',
};

describe('the offer to save a guest run to the account', () => {
  it('saves the run when Save to account is pressed', async () => {
    await renderSettled(<GuestRunSaveOffer template={template} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save to account' }));
    });

    expect(saving.save).toHaveBeenCalledTimes(1);
  });

  it('waits while the Organizations load', async () => {
    saving.isWorkspaceLoading = true;
    await renderSettled(<GuestRunSaveOffer template={template} />);

    expect(screen.getByRole('button', { name: 'Save to account' })).toHaveProperty('disabled', true);
  });
});
