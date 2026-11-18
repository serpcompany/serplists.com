import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { answerTheAppFromTheApiOnSqlite, closeTheApiDatabase, signedInAs } from '../../../support/appApiOnSqlite';
import { FRESH_ROUTER_IMPORT_TIMEOUT_MS } from '../../../support/apiRouter';
import { onlyElement } from '../../../support/elements';
import { acceptIncomingTeamInvite, transferTeamOwnership, updateTeamMember } from '@/features/teams/teamSettingsRequests';
import { api } from '@/lib/api';

async function guestJoinsAnOrganizationOfOwner() {
  signedInAs('owner');
  const organization = await api.createTeam({ name: 'Acme Launch' });
  await api.createTeamInvite(organization.id, { email: 'guest@example.test', role: 'viewer' });
  signedInAs('guest');
  const joined = await acceptIncomingTeamInvite(onlyElement(await api.getIncomingTeamInvites()).id);
  signedInAs('owner');
  return { organizationId: organization.id, guestMemberId: joined.memberId };
}

const rolesIn = async (organizationId: string) =>
  Object.fromEntries((await api.getTeamMembers(organizationId)).map(({ user_id, role }) => [user_id, role]));

describe('the member changes the Organization settings page sends', { timeout: FRESH_ROUTER_IMPORT_TIMEOUT_MS }, () => {
  beforeEach(async () => {
    await answerTheAppFromTheApiOnSqlite(['owner', 'guest']);
  });

  afterEach(closeTheApiDatabase);

  it('makes a member an admin, then hands them the Organization', async () => {
    const { organizationId, guestMemberId } = await guestJoinsAnOrganizationOfOwner();

    expect(await updateTeamMember(organizationId, guestMemberId, { role: 'admin' })).toEqual({ success: true });
    expect(await rolesIn(organizationId)).toEqual({ owner: 'owner', guest: 'admin' });

    expect(await transferTeamOwnership(organizationId, guestMemberId)).toMatchObject({ ownerMemberId: guestMemberId, ownerUserId: 'guest' });
    expect(await rolesIn(organizationId)).toMatchObject({ guest: 'owner' });
  });
});
