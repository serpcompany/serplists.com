import type { BrowserContext } from '@playwright/test';
import { test, expect, endpoint, login, visit } from './fixtures/real-d1';
import { recordRouteScenarios } from '../../scripts/data/route-coverage-evidence.mjs';

async function request(context: BrowserContext, method: string, path: string, data?: unknown, status = 200) {
  const response = await context.request.fetch(`${endpoint}${path}`, { method, ...(data === undefined ? {} : { data }) });
  const body = await response.json();
  expect(response.status(), `${method} ${path}: ${JSON.stringify(body)}`).toBe(status);
  return body;
}

test('@real-d1 teams persist invites, membership permissions and ownership transitions', async ({ page, context }) => {
  test.setTimeout(180_000);
  test.skip(process.env.PLAYWRIGHT_ROUTE_NEGATIVE === '1');
  expect(process.env.PLAYWRIGHT_USE_DEV_VARS).toBe('0');
  async function switchUser(role = 'owner') {
    await page.waitForLoadState('networkidle');
    if (page.url().startsWith('http')) await page.evaluate(() => localStorage.clear());
    await context.clearCookies();
    await login(page, role);
  }
  await switchUser();
  const team = await request(context, 'POST', '/teams', { name: 'Mutation Team' });
  const route = `/teams/${team.id}`;
  const members = () => request(context, 'GET', `${route}/members`);
  const details = () => request(context, 'GET', route);
  const invite = (role: string) => request(context, 'POST', `${route}/invites`, { email: `coverage-${role}@e2e.local`, role });
  expect(team).toMatchObject({ role: 'owner', membershipStatus: 'active' });
  await request(context, 'PUT', route, { name: 'Mutation Team Updated', slug: `mutation-team-${team.id}` });
  expect(await details()).toMatchObject({ name: 'Mutation Team Updated', slug: `mutation-team-${team.id}`, billing_owner_user_id: 'coverage-owner' });
  await request(context, 'PUT', route, { slug: 'coverage-team' }, 409);
  const editorInvite = await invite('editor');
  const runnerInvite = await invite('runner');
  const revoked = await invite('viewer');
  await request(context, 'POST', `${route}/invites`, { email: 'coverage-editor@e2e.local', role: 'editor' }, 409);
  expect((await request(context, 'GET', `${route}/invites`)).map((row: { id: string }) => row.id).sort()).toEqual([editorInvite.id, runnerInvite.id, revoked.id].sort());
  await request(context, 'DELETE', `${route}/invites/${revoked.id}`);
  expect((await request(context, 'GET', `${route}/invites`)).map((row: { id: string }) => row.id).sort()).toEqual([editorInvite.id, runnerInvite.id].sort());
  await request(context, 'POST', `/teams/invites/${editorInvite.inviteToken}/accept`, {}, 403);
  await switchUser('viewer');
  expect((await request(context, 'GET', '/teams/invites/pending')).some((row: { id: string }) => row.id === revoked.id)).toBe(false);
  await request(context, 'POST', `/teams/invites/${revoked.inviteToken}/accept`, {}, 404);
  await request(context, 'GET', route, undefined, 404);

  await switchUser('editor');
  expect((await request(context, 'GET', '/teams/invites/pending')).some((row: { id: string }) => row.id === editorInvite.id)).toBe(true);
  await visit(page, editorInvite.invitePath, 'Invite accepted');
  expect(await details()).toMatchObject({ membership: { role: 'editor', status: 'active' } });
  const accepted = await request(context, 'POST', `/teams/invites/${editorInvite.inviteToken}/accept`, {});
  expect((await members()).filter((row: { user_id: string }) => row.user_id === 'coverage-editor')).toHaveLength(1);
  expect(await page.evaluate(() => localStorage.getItem('serplists.activeWorkspaceId'))).toBe(team.id);
  for (const [method, suffix, body] of [
    ['PUT', '', { name: 'Forbidden rename' }],
    ['GET', '/invites', undefined],
    ['POST', '/invites', { email: 'nobody@e2e.local' }],
    ['DELETE', `/invites/${runnerInvite.id}`, undefined],
    ['GET', '/activity', undefined],
    ['PUT', `/members/${team.memberId}`, { role: 'viewer' }],
    ['PUT', '/owner', { memberId: accepted.memberId }],
  ] as const) await request(context, method, `${route}${suffix}`, body, 403);

  await switchUser('runner');
  await request(context, 'POST', `/teams/invites/pending/${runnerInvite.id}/accept`, {});
  expect((await details()).membership.role).toBe('runner');
  await switchUser();
  expect(await request(context, 'GET', `${route}/invites`)).toEqual([]);
  expect(await members()).toHaveLength(3);
  await request(context, 'PUT', `${route}/members/${team.memberId}`, { role: 'admin' }, 400);
  await request(context, 'PUT', `${route}/owner`, { memberId: team.memberId }, 400);
  await request(context, 'PUT', `${route}/members/${accepted.memberId}`, { role: 'admin', status: 'disabled' });
  expect((await members()).find((row: { id: string }) => row.id === accepted.memberId)).toMatchObject({ role: 'admin', status: 'disabled' });
  const rejoin = await invite('editor');
  await switchUser('editor');
  expect((await request(context, 'GET', '/teams')).some((row: { id: string }) => row.id === team.id)).toBe(false);
  await request(context, 'GET', route, undefined, 404);
  const reaccepted = await request(context, 'POST', `/teams/invites/pending/${rejoin.id}/accept`, {});
  expect(reaccepted).toMatchObject({ memberId: accepted.memberId, role: 'editor' });
  await switchUser();
  await request(context, 'PUT', `${route}/members/${accepted.memberId}`, { role: 'admin' });
  await switchUser('editor');
  expect((await details()).membership.role).toBe('admin');
  await request(context, 'PUT', `${route}/members/${team.memberId}`, { status: 'disabled' }, 400);
  await request(context, 'PUT', `${route}/owner`, { memberId: accepted.memberId }, 403);
  await switchUser();
  await request(context, 'PUT', `${route}/owner`, { memberId: accepted.memberId });
  expect(await details()).toMatchObject({ billing_owner_user_id: 'coverage-editor', membership: { role: 'admin' } });
  await request(context, 'PUT', `${route}/owner`, { memberId: team.memberId }, 403);
  await switchUser('editor');
  expect((await details()).membership.role).toBe('owner');
  expect((await members()).filter((row: { role: string }) => row.role === 'owner')).toHaveLength(1);
  await request(context, 'PUT', `${route}/owner`, { memberId: team.memberId });
  expect(await details()).toMatchObject({ billing_owner_user_id: 'coverage-owner', membership: { role: 'admin' } });
  const actions = (await request(context, 'GET', `${route}/activity`)).map((row: { action: string }) => row.action);
  expect(actions).toEqual(expect.arrayContaining(['team.created', 'team.updated', 'team_invite.created', 'team_invite.revoked', 'team_invite.accepted', 'team_member.updated', 'team.owner_transferred']));
  // The runner destroys this entire isolated D1 after the suite. No team-delete API exists.
  recordRouteScenarios(['team-mutations']);
});
