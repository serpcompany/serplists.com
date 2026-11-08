import '../../../support/mockedToasts';
import React, { act } from 'react';
import { fireEvent, screen, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';

import { ArchiveRecoverySection } from '@/components/dashboard/ArchiveRecoverySection';
import { api } from '@/lib/api';
import { getResourcePermissions } from '@/lib/organizationPermissions';

import { createTestQueryClient } from '../../../fixtures/queryClient';
import { deferred } from '../../../support/deferred';
import { renderSettled } from '../../../support/renderInTheDom';

vi.mock('@/contexts/CloudflareAuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: () => ({
    activeTeamId: undefined,
    getPermissions: (teamId?: string) => getResourcePermissions(teamId, () => undefined),
    isWorkspaceLoading: false,
    workspaceScopeId: 'personal',
  }),
}));
vi.mock('@/lib/api', async () => (await import('../../../support/emptyArchiveApi')).emptyArchiveApi());

const archivedRow = (id: string, title: string) => ({ id, title, deleted_at: '2026-10-01T00:00:00.000Z', updated_at: null });

const listNamed = (title: string) => {
  const card = screen.getByRole('heading', { name: title }).closest('[data-slot="card"]');
  if (!(card instanceof HTMLElement)) throw new Error(`No card titled ${title}`);
  return within(card);
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('restoring from the Archive', () => {
  it('restores a Template and a run from their lists, saying Restoring... until each is back', async () => {
    vi.mocked(api.getArchivedTemplates).mockResolvedValue([archivedRow('template-1', 'Launch plan')]);
    vi.mocked(api.getArchivedChecklists).mockResolvedValue([archivedRow('run-1', 'Launch run')]);
    const restoring = deferred<{ success: true }>();
    vi.mocked(api.restoreTemplate).mockReturnValue(restoring.promise);
    vi.mocked(api.restoreChecklist).mockResolvedValue({ success: true });
    await renderSettled(
      <QueryClientProvider client={createTestQueryClient()}>
        <ArchiveRecoverySection />
      </QueryClientProvider>,
    );
    await screen.findByText('Launch plan');

    await act(async () => {
      fireEvent.click(listNamed('Archived templates').getByRole('button', { name: 'Restore' }));
    });
    expect(listNamed('Archived templates').getByRole('button', { name: 'Restoring...' }).hasAttribute('disabled')).toBe(true);
    await act(async () => {
      restoring.resolve({ success: true });
    });
    await act(async () => {
      fireEvent.click(listNamed('Archived runs').getByRole('button', { name: 'Restore' }));
    });

    expect(api.restoreTemplate).toHaveBeenCalledWith('template-1');
    expect(api.restoreChecklist).toHaveBeenCalledWith('run-1');
    expect(toast.success).toHaveBeenCalledWith('Template restored');
    expect(toast.success).toHaveBeenCalledWith('Run restored');
  });
});
