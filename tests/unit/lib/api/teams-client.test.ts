import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { answerTheAppFromTheApiOnSqlite, closeTheApiDatabase, signedInAs } from '../../../support/appApiOnSqlite';
import { FRESH_ROUTER_IMPORT_TIMEOUT_MS } from '../../../support/apiRouter';
import { arrayContaining } from '../../../support/asymmetricMatchers';
import { onlyElement } from '../../../support/elements';
import { api } from '@/lib/api';
import { ApiError } from '@/lib/api-errors';

async function anOrganizationOwnedBy(owner: string) {
  signedInAs(owner);
  return api.createTeam({ name: 'Acme Launch' });
}

describe('the Organization requests the app sends, answered by the API', { timeout: FRESH_ROUTER_IMPORT_TIMEOUT_MS }, () => {
  beforeEach(async () => {
    await answerTheAppFromTheApiOnSqlite(['owner', 'guest', 'other']);
  });

  afterEach(closeTheApiDatabase);

  it('creates and renames an Organization, invites someone by link, and lets them join from it', async () => {
    const organization = await anOrganizationOwnedBy('owner');
    expect(organization).toMatchObject({ name: 'Acme Launch', role: 'owner', membershipStatus: 'active' });

    const updated = await api.updateTeam(organization.id, { name: 'Acme Launches', description: 'Ships launches' });
    expect(updated.team).toMatchObject({ id: organization.id, name: 'Acme Launches', description: 'Ships launches' });

    const invite = await api.createTeamInvite(organization.id, { email: 'guest@example.test', role: 'editor' });
    expect(invite).toMatchObject({ email: 'guest@example.test', role: 'editor' });
    expect((await api.getTeamInvites(organization.id)).map(({ email, role }) => ({ email, role }))).toEqual([
      { email: 'guest@example.test', role: 'editor' },
    ]);

    signedInAs('guest');
    expect(await api.getTeamInvitePreview(invite.inviteToken)).toMatchObject({
      status: 'pending',
      teamId: organization.id,
      teamName: 'Acme Launches',
      role: 'editor',
    });
    expect(await api.acceptTeamInvite(invite.inviteToken)).toMatchObject({ teamId: organization.id, role: 'editor' });

    signedInAs('owner');
    const members = await api.getTeamMembers(organization.id);
    expect(members.map(({ user_id, role }) => ({ user_id, role }))).toEqual(
      arrayContaining([{ user_id: 'owner', role: 'owner' }, { user_id: 'guest', role: 'editor' }]),
    );
  });

  it('changes a member, hands the Organization over, and lets the old owner leave', async () => {
    const organization = await anOrganizationOwnedBy('owner');
    const invite = await api.createTeamInvite(organization.id, { email: 'guest@example.test', role: 'viewer' });
    signedInAs('guest');
    const joined = await api.acceptTeamInvite(invite.inviteToken);

    signedInAs('owner');
    expect(await api.updateTeamMember(organization.id, joined.memberId, { role: 'admin' })).toEqual({ success: true });
    expect(await api.transferTeamOwnership(organization.id, joined.memberId)).toMatchObject({
      success: true,
      ownerMemberId: joined.memberId,
      ownerUserId: 'guest',
    });
    expect(await api.leaveTeam(organization.id)).toEqual({ success: true });

    signedInAs('guest');
    const members = await api.getTeamMembers(organization.id);
    expect(onlyElement(members.filter(({ status }) => status === 'active'))).toMatchObject({ user_id: 'guest', role: 'owner' });
  });

  it('shows a signed-in person the invites waiting for them, and joins or declines from that list', async () => {
    const organization = await anOrganizationOwnedBy('owner');
    await api.createTeamInvite(organization.id, { email: 'guest@example.test', role: 'runner' });
    const declined = await api.createTeamInvite(organization.id, { email: 'other@example.test', role: 'viewer' });

    signedInAs('guest');
    const waiting = onlyElement(await api.getIncomingTeamInvites());
    expect(waiting).toMatchObject({ teamId: organization.id, teamName: 'Acme Launch', role: 'runner' });
    expect(await api.acceptIncomingTeamInvite(waiting.id)).toMatchObject({ teamId: organization.id, role: 'runner' });
    expect(await api.getIncomingTeamInvites()).toEqual([]);

    signedInAs('other');
    expect(await api.declineTeamInvite(declined.inviteToken)).toEqual({ success: true });
    expect(await api.getIncomingTeamInvites()).toEqual([]);
  });

  it('replaces a lost invite link and withdraws an invite, after which neither link opens', async () => {
    const organization = await anOrganizationOwnedBy('owner');
    const first = await api.createTeamInvite(organization.id, { email: 'guest@example.test', role: 'editor' });
    const reissued = await api.reissueTeamInviteLink(organization.id, first.id);
    expect(reissued.inviteToken).not.toBe(first.inviteToken);

    expect(await api.revokeTeamInvite(organization.id, first.id)).toEqual({ success: true });
    expect(await api.getTeamInvites(organization.id)).toEqual([]);

    signedInAs('guest');
    for (const token of [first.inviteToken, reissued.inviteToken]) {
      const refused = api.getTeamInvitePreview(token);
      await expect(refused).rejects.toBeInstanceOf(ApiError);
      await expect(refused).rejects.toMatchObject({ status: 404 });
    }
  });
});
