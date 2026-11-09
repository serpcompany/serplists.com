import React, { act } from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';

import { TeamInvitesPanel } from '@/components/account/TeamInvitesPanel';
import { api, type CreatedTeamInvite } from '@/lib/api';
import { ApiError } from '@/lib/api-errors';

import { inputNamed, renderSettled } from '../../support/renderInTheDom';
import { chooseTheOption } from '../../support/selectOptions';

vi.mock('@/contexts/CloudflareAuthContext', () => ({ useAuth: () => ({ user: { id: 'owner-1' } }) }));
vi.mock('@/lib/api', () => ({
  api: {
    createTeamInvite: vi.fn(),
    getTeamActivity: vi.fn().mockResolvedValue([]),
    getTeamInvites: vi.fn(),
    getTeamMembers: vi.fn().mockResolvedValue([]),
    reissueTeamInviteLink: vi.fn(),
    revokeTeamInvite: vi.fn(),
  },
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const pendingInvite = {
  id: 'invite-1',
  team_id: 'team-1',
  email: 'sam@example.test',
  role: 'editor' as const,
  invited_by_user_id: 'owner-1',
  expires_at: '2026-12-01T00:00:00.000Z',
  created_at: '2026-11-01T00:00:00.000Z',
  inviterName: 'Olive Owner',
};

const createdInvite = (overrides: Partial<CreatedTeamInvite> = {}): CreatedTeamInvite => ({
  id: 'invite-2',
  email: 'kim@example.test',
  role: 'viewer',
  expiresAt: '2026-12-01T00:00:00.000Z',
  inviteToken: 'token-2',
  invitePath: '/team-invites/token-2',
  inviteUrl: 'https://serplists.test/team-invites/token-2',
  ...overrides,
});

const kimInvite = { ...pendingInvite, id: 'invite-2', email: 'kim@example.test', role: 'runner' as const };

const writeText = vi.fn();

async function mountThePanel(shownOnceLoaded = 'sam@example.test') {
  await renderSettled(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TeamInvitesPanel teamId="team-1" />
    </QueryClientProvider>,
  );
  await screen.findByText(shownOnceLoaded);
}

const press = (name: string) =>
  act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });

const submitTheInvite = (email: string) =>
  act(async () => {
    fireEvent.change(inputNamed('Invite email'), { target: { value: email } });
    fireEvent.submit(screen.getByRole('button', { name: 'Create link' }).closest('form') ?? document.body);
  });

beforeEach(() => {
  vi.mocked(api.getTeamInvites).mockResolvedValue([pendingInvite]);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('creating an invite link', () => {
  it('asks for an email before creating anything', async () => {
    await mountThePanel();

    await submitTheInvite('');

    expect(toast.error).toHaveBeenCalledWith('Email is required');
    expect(api.createTeamInvite).not.toHaveBeenCalled();
  });

  it('creates a link for the chosen role, shows it, clears the email, and copies it on request', async () => {
    vi.mocked(api.createTeamInvite).mockResolvedValue(createdInvite({ role: 'runner' }));
    writeText.mockResolvedValue(undefined);
    await mountThePanel();
    vi.mocked(api.getTeamInvites).mockResolvedValue([pendingInvite, kimInvite]);

    await chooseTheOption('Role', 'Runner');
    await submitTheInvite('kim@example.test');

    expect(api.createTeamInvite).toHaveBeenCalledWith('team-1', { email: 'kim@example.test', role: 'runner' });
    expect(toast.success).toHaveBeenCalledWith('Invite link created');
    expect(inputNamed('Invite email').value).toBe('');
    expect(inputNamed('Invite link').value).toBe('https://serplists.test/team-invites/token-2');
    expect(screen.getByText('Invite link for kim@example.test')).toBeTruthy();

    await press('Copy invite link');

    expect(writeText).toHaveBeenCalledWith('https://serplists.test/team-invites/token-2');
    expect(toast.success).toHaveBeenCalledWith('Invite link copied');
  });

  it('says when the browser refused to copy the link', async () => {
    vi.mocked(api.createTeamInvite).mockResolvedValue(createdInvite());
    writeText.mockRejectedValue(new Error('denied'));
    await mountThePanel();
    vi.mocked(api.getTeamInvites).mockResolvedValue([pendingInvite, kimInvite]);
    await submitTheInvite('kim@example.test');

    await press('Copy invite link');

    expect(toast.error).toHaveBeenCalledWith('Unable to copy invite link');
  });

  it("shows the server's reason when the invite could not be created", async () => {
    vi.mocked(api.createTeamInvite).mockRejectedValue(new ApiError({ status: 400, message: 'That email is not valid' }));
    await mountThePanel();

    await submitTheInvite('kim@');

    expect(toast.error).toHaveBeenCalledWith('That email is not valid');
    expect(inputNamed('Invite email').value).toBe('kim@');
  });

  it('offers a new link for an email already invited, and replaces the old link once confirmed', async () => {
    vi.mocked(api.createTeamInvite).mockRejectedValue(
      new ApiError({ status: 409, message: 'Pending', code: 'team_invite_exists', details: { inviteId: 'invite-1' } }),
    );
    vi.mocked(api.reissueTeamInviteLink).mockResolvedValue(createdInvite({ id: 'invite-1', email: 'sam@example.test', inviteUrl: 'https://serplists.test/team-invites/token-3' }));
    await mountThePanel();
    await submitTheInvite('sam@example.test');

    expect(screen.getByRole('status').textContent).toContain('An invite is already pending for sam@example.test');
    expect(toast.success).not.toHaveBeenCalled();

    await press('Create new link');

    expect(api.reissueTeamInviteLink).toHaveBeenCalledWith('team-1', 'invite-1', { role: 'viewer' });
    expect(toast.success).toHaveBeenCalledWith('New invite link created. The previous link no longer works.');
    expect(inputNamed('Invite email').value).toBe('');
    expect(inputNamed('Invite link').value).toBe('https://serplists.test/team-invites/token-3');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('keeps the email and drops the offer on Cancel', async () => {
    vi.mocked(api.createTeamInvite).mockRejectedValue(
      new ApiError({ status: 409, message: 'Pending', code: 'team_invite_exists', details: { inviteId: 'invite-1' } }),
    );
    await mountThePanel();
    await submitTheInvite('sam@example.test');

    await press('Cancel');

    expect(screen.queryByRole('status')).toBeNull();
    expect(api.reissueTeamInviteLink).not.toHaveBeenCalled();
    expect(inputNamed('Invite email').value).toBe('sam@example.test');
  });
});

describe('the pending invites', () => {
  it('lists each pending invite with who sent it', async () => {
    await mountThePanel();

    expect(screen.getByRole('listitem').textContent).toContain('sam@example.test');
    expect(screen.getByRole('listitem').textContent).toContain('Olive Owner');
  });

  it('makes a new link for a pending invite', async () => {
    vi.mocked(api.reissueTeamInviteLink).mockResolvedValue(createdInvite({ id: 'invite-1', email: 'sam@example.test' }));
    await mountThePanel();

    await press('New link for sam@example.test');

    expect(api.reissueTeamInviteLink).toHaveBeenCalledWith('team-1', 'invite-1', {});
    expect(screen.getByText('Invite link for sam@example.test')).toBeTruthy();
  });

  it('says why a new link failed', async () => {
    vi.mocked(api.reissueTeamInviteLink).mockRejectedValue(new Error(''));
    await mountThePanel();

    await press('New link for sam@example.test');

    expect(toast.error).toHaveBeenCalledWith('Failed to create a new invite link');
  });

  it('revokes an invite and reloads the list', async () => {
    vi.mocked(api.revokeTeamInvite).mockResolvedValue({ success: true });
    await mountThePanel();
    vi.mocked(api.getTeamInvites).mockResolvedValue([]);

    await press('Revoke invite for sam@example.test');

    expect(api.revokeTeamInvite).toHaveBeenCalledWith('team-1', 'invite-1');
    expect(toast.success).toHaveBeenCalledWith('Invite revoked');
    await screen.findByText('No pending invites.');
  });

  it('says why revoking failed', async () => {
    vi.mocked(api.revokeTeamInvite).mockRejectedValue(new ApiError({ status: 500, message: 'Database unavailable' }));
    await mountThePanel();

    await press('Revoke invite for sam@example.test');

    expect(toast.error).toHaveBeenCalledWith('Database unavailable');
  });

  it('retries a list that failed to load', async () => {
    vi.mocked(api.getTeamInvites).mockRejectedValueOnce(new ApiError({ status: 500, message: 'Down' }));
    await mountThePanel("Couldn't load pending invites.");

    await press('Retry');

    await screen.findByText('sam@example.test');
  });
});
