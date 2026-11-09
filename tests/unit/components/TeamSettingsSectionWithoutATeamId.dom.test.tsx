import React, { act } from 'react';
import { fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';

import { TeamSettingsSection } from '@/components/account/TeamSettingsSection';
import { api, type TeamMember } from '@/lib/api';

import { handlerIn } from '../../support/elementTree';
import { renderSettled } from '../../support/renderInTheDom';

const memberList = vi.hoisted(() => ({ props: null as null | Record<string, unknown> }));

vi.mock('@/contexts/CloudflareAuthContext', () => ({ useAuth: () => ({ user: { id: 'owner-1', email: 'owner@example.com' } }) }));
vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: () => ({
    activeTeamId: null,
    activeWorkspace: { id: 'team-1', teamId: 'team-1', type: 'team', memberId: 'member-1', name: 'Acme', role: 'owner', slug: 'acme' },
    canManageTeam: true,
    isTeamWorkspace: true,
    patchTeam: vi.fn(),
    refreshTeams: vi.fn(),
  }),
}));
vi.mock('@/lib/api', () => ({
  api: { getTeamActivity: vi.fn(), getTeamMembers: vi.fn(), transferTeamOwnership: vi.fn(), updateTeam: vi.fn(), updateTeamMember: vi.fn() },
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));
vi.mock('@/components/account/TeamActivityList', () => ({ TeamActivityList: () => null }));
vi.mock('@/components/account/OrganizationMemberList', () => ({
  OrganizationMemberList: (props: Record<string, unknown>) => {
    memberList.props = props;
    return null;
  },
}));

const editor: TeamMember = { id: 'member-2', team_id: 'team-1', user_id: 'editor-1', role: 'editor', status: 'active', email: 'editor@example.com', name: 'Eda' };

const renderTheSection = () =>
  renderSettled(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TeamSettingsSection />
    </QueryClientProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Organization settings shown before the workspace names the Organization it holds', () => {
  it('saves nothing and asks for an Organization when the settings form is submitted', async () => {
    const { container } = await renderTheSection();
    const form = container.querySelector('form');
    if (!form) throw new Error('The settings form is not on the page');

    await act(async () => {
      fireEvent.submit(form);
    });

    expect(toast.error).toHaveBeenCalledWith('Select an Organization before updating its settings');
    expect(api.updateTeam).not.toHaveBeenCalled();
  });

  it('changes no member and transfers no ownership', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    await renderTheSection();

    await act(async () => {
      handlerIn(memberList.props, 'onUpdateMember')(editor, { role: 'viewer' });
      handlerIn(memberList.props, 'onTransferOwnership')(editor);
      await Promise.resolve();
    });

    expect(api.updateTeamMember).not.toHaveBeenCalled();
    expect(api.transferTeamOwnership).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });
});
