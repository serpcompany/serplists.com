import { beforeAll, describe, expect, it } from 'vitest';
import { canDeleteRun, canUpdateRun, canViewRun, canViewRunHistory } from '@functions/api/utils/run-access';
import { canEditTemplate, canViewPrivateTemplate } from '@functions/api/utils/template-permissions';
import { SqliteD1 } from '../../../support/sqlite-d1';
import { apiEnvOn } from '../../../support/apiEnv';
import type { Env } from '@functions/api/types';

const createdAt = '2026-01-01T00:00:00.000Z';
let env: Env;

beforeAll(() => {
  const d1 = new SqliteD1();
  for (const id of ['creator', 'admin', 'editor', 'runner', 'viewer', 'former', 'outsider']) {
    d1.run('INSERT INTO users (id, email, name, email_verified, created_at) VALUES (?, ?, ?, 1, ?)', id, `${id}@example.test`, id, createdAt);
  }
  d1.run(
    `INSERT INTO teams (id, name, slug, billing_owner_user_id, created_by_user_id, created_at)
     VALUES ('team-1', 'Acme', 'acme', 'creator', 'creator', ?)`,
    createdAt,
  );
  const members = [['admin', 'admin', 'active'], ['editor', 'editor', 'active'], ['runner', 'runner', 'active'], ['viewer', 'viewer', 'active'], ['former', 'admin', 'removed']];
  for (const [userId, role, status] of members) {
    d1.run(
      `INSERT INTO team_members (id, team_id, user_id, role, status, joined_at, created_at)
       VALUES (?, 'team-1', ?, ?, ?, ?, ?)`,
      `member-${userId}`, userId, role, status, createdAt, createdAt,
    );
  }
  env = apiEnvOn(d1);
});

const everyone = ['creator', 'admin', 'editor', 'runner', 'viewer', 'former', 'outsider'];

async function whoMay(check: (userId: string) => Promise<boolean>): Promise<string[]> {
  const allowed = await Promise.all(everyone.map(async (userId) => ((await check(userId)) ? [userId] : [])));
  return allowed.flat();
}

describe('access by the ownership columns of a run or a Template', () => {
  const organizationRun = { team_id: 'team-1', user_id: 'creator', deleted_at: null };
  const personalRun = { team_id: null, user_id: 'runner', deleted_at: null };

  it('gives an Organization run to its active members by role, and a personal run to its owner only', async () => {
    expect(await whoMay((userId) => canViewRun(env, organizationRun, userId))).toEqual(['admin', 'editor', 'runner', 'viewer']);
    expect(await whoMay((userId) => canUpdateRun(env, organizationRun, userId))).toEqual(['admin', 'editor', 'runner']);
    expect(await whoMay((userId) => canDeleteRun(env, organizationRun, userId))).toEqual(['admin']);
    expect(await whoMay((userId) => canUpdateRun(env, personalRun, userId))).toEqual(['runner']);
    expect(await whoMay((userId) => canViewRunHistory(env, { ...organizationRun, deleted_at: createdAt }, userId)))
      .toEqual(['admin', 'editor', 'runner', 'viewer']);
  });

  it('gives a Template the Organization owns to its active members by role', async () => {
    const template = { owner_type: 'team', team_id: 'team-1', user_id: 'creator' };

    expect(await whoMay((userId) => canViewPrivateTemplate(env, template, userId))).toEqual(['admin', 'editor', 'runner', 'viewer']);
    expect(await whoMay((userId) => canEditTemplate(env, template, userId))).toEqual(['admin', 'editor']);
  });

  it.each([
    ['a personal Template that still names an Organization', { owner_type: 'user', team_id: 'team-1', user_id: 'viewer' }],
    ['an Organization Template whose Organization was deleted', { owner_type: 'team', team_id: null, user_id: 'viewer' }],
  ])('gives %s to its user only', async (_label, template) => {
    expect(await whoMay((userId) => canViewPrivateTemplate(env, template, userId))).toEqual(['viewer']);
    expect(await whoMay((userId) => canEditTemplate(env, template, userId))).toEqual(['viewer']);
  });
});
