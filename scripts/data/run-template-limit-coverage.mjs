import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { and, count, eq, isNull } from 'drizzle-orm';
import { createDb, schema } from '../../functions/api/db.ts';

const PASSWORD = 'password123';
const CREATED_AT = '2026-09-05';
const AUTH_TIME = 1788566400000;
const EMPTY_SECTIONS = JSON.stringify([{ id: 'limit-section', title: 'Limit Section', items: [] }]);

export async function runTemplateLimitCoverage({ mf, db }) {
  assert(mf?.dispatchFetch, 'runTemplateLimitCoverage requires the real Miniflare Worker');
  assert(db?.prepare, 'runTemplateLimitCoverage requires the real migrated D1 binding');
  const orm = createDb({ DB: db });
  assert((await orm.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, 'coverage-owner')).limit(1))[0], 'coverage-owner fixture is required');
  assert((await orm.select({ id: schema.templates.id }).from(schema.templates).where(eq(schema.templates.id, 'coverage-public')).limit(1))[0], 'coverage-public fixture is required');

  const prefix = `i127-template-limits-${randomUUID().slice(0, 8)}`;
  const createdIds = [];
  const scenarios = [];

  async function createUser(label) {
    const id = `${prefix}-${label}`;
    const email = `${id}@e2e.local`;
    await orm.insert(schema.users).values({ id, email, name: `Issue 127 ${label}`, username: id.replaceAll('-', '_'), email_verified: true, created_at: CREATED_AT, auth_created_at: new Date(AUTH_TIME), auth_updated_at: new Date(AUTH_TIME) });
    const [sourceAccount] = await orm.select({ password: schema.account.password }).from(schema.account).where(eq(schema.account.userId, 'coverage-owner')).limit(1);
    await orm.insert(schema.account).values({ id: `${id}-credential`, accountId: id, providerId: 'credential', userId: id, password: sourceAccount.password, createdAt: new Date(AUTH_TIME), updatedAt: new Date(AUTH_TIME) });
    createdIds.push(id);
    return { id, email };
  }

  async function login(user) {
    const response = await mf.dispatchFetch('http://localhost/api/auth/sign-in/email', {
      method: 'POST',
      redirect: 'manual',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
      body: JSON.stringify({ email: user.email, password: PASSWORD }),
    });
    const text = await response.text();
    assert.equal(response.status, 200, `login ${user.id}: ${text.slice(0, 300)}`);
    const cookie = response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
    assert(cookie.includes('session_token'), `real Better Auth cookie required for ${user.id}`);
    return cookie;
  }

  async function api(cookie, route, { method = 'GET', body, status = 200 } = {}) {
    const response = await mf.dispatchFetch(`http://localhost${route}`, {
      method,
      redirect: 'manual',
      headers: {
        Cookie: cookie,
        Origin: 'http://localhost',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    assert.equal(response.status, status, `${method} ${route}: ${text.slice(0, 500)}`);
    return text ? JSON.parse(text) : null;
  }

  async function countRows(table, where) {
    const [row] = await orm.select({ count: count() }).from(table).where(where);
    return Number(row?.count ?? 0);
  }

  async function seedTemplate({ id, userId, slug, teamId = null, isPublic = 0, rules = null }) {
    await orm.insert(schema.templates).values({ id, user_id: userId, title: `Template ${id}`, description: 'Issue 127 runtime coverage', items: EMPTY_SECTIONS, is_public: Boolean(isPublic), category: '[]', tags: '[]', slug, version: 1, type: 'checklist', rules, owner_type: teamId ? 'team' : 'user', team_id: teamId, created_by_user_id: userId, created_at: CREATED_AT });
    createdIds.push(id);
  }

  async function seedRun({ id, userId, teamId = null, templateId = null, deletedAt = null, isPublic = 0, shareToken = null }) {
    await orm.insert(schema.checklist_runs).values({ id, user_id: userId, team_id: teamId, template_id: templateId, title: `Run ${id}`, items: EMPTY_SECTIONS, status: 'in_progress', started_at: CREATED_AT, created_at: CREATED_AT, deleted_at: deletedAt, is_public: Boolean(isPublic), share_token: shareToken, created_by_user_id: userId, started_by_user_id: userId });
    createdIds.push(id);
  }

  async function seedTeam({ id, userId }) {
    await orm.insert(schema.teams).values({ id, name: `Team ${id}`, slug: id, created_by_user_id: userId, billing_owner_user_id: userId, created_at: CREATED_AT });
    await orm.insert(schema.team_members).values({ id: `${id}-membership`, team_id: id, user_id: userId, role: 'editor', status: 'active', created_at: CREATED_AT });
    createdIds.push(id);
  }

  const templatePayload = (title, slug) => ({
    title,
    slug,
    sections: [{ id: `${slug}-section`, title: 'Section', items: [] }],
  });

  const createUnder = await createUser('create-under');
  const createUnderCookie = await login(createUnder);
  const createResult = await api(createUnderCookie, '/api/templates', {
    method: 'POST',
    body: templatePayload('Create Under Limit', `${prefix}-create-under`),
  });
  createdIds.push(createResult.id);
  assert.equal(await countRows(schema.templates, and(eq(schema.templates.user_id, createUnder.id), isNull(schema.templates.deleted_at))), 1);
  assert.equal(await countRows(schema.template_versions, eq(schema.template_versions.template_id, createResult.id)), 1);
  assert.equal(await countRows(schema.audit_events, and(eq(schema.audit_events.resource_id, createResult.id), eq(schema.audit_events.action, 'template.created'))), 1);
  scenarios.push('template-create-free-under-cap');

  const createOver = await createUser('create-over');
  await seedTemplate({ id: `${prefix}-create-existing`, userId: createOver.id, slug: `${prefix}-create-existing` });
  const createOverCookie = await login(createOver);
  const createBefore = await countRows(schema.templates, eq(schema.templates.user_id, createOver.id));
  const createDenied = await api(createOverCookie, '/api/templates', {
    method: 'POST',
    status: 403,
    body: templatePayload('Create Over Limit', `${prefix}-create-denied`),
  });
  assert.equal(createDenied.code, 'limit_reached');
  assert.deepEqual(createDenied.details, { limit: 1, current: 1, resource: 'templates' });
  assert.equal(await countRows(schema.templates, eq(schema.templates.user_id, createOver.id)), createBefore);
  scenarios.push('template-create-free-over-cap');

  for (const atCap of [false,true]) {
    const actor = await createUser(`template-restore-${atCap ? 'over' : 'under'}`);
    const archivedId = `${actor.id}-archived`;
    await seedTemplate({id:archivedId,userId:actor.id,slug:archivedId});
    await orm.update(schema.templates).set({ deleted_at: CREATED_AT }).where(eq(schema.templates.id, archivedId));
    if (atCap) await seedTemplate({id:`${actor.id}-active`,userId:actor.id,slug:`${actor.id}-active`});
    const actorCookie = await login(actor);
    const restored = await api(actorCookie,`/api/templates/${archivedId}/restore`,{method:'POST',body:{},status:atCap?403:200});
    const [row] = await orm.select({ deleted_at: schema.templates.deleted_at, version: schema.templates.version, user_id: schema.templates.user_id }).from(schema.templates).where(eq(schema.templates.id, archivedId)).limit(1);
    assert.equal(row.user_id,actor.id);
    assert.equal(row.deleted_at,atCap?CREATED_AT:null);
    assert.equal(await countRows(schema.templates, and(eq(schema.templates.user_id, actor.id), isNull(schema.templates.deleted_at))),1);
    assert.equal(await countRows(schema.template_versions, eq(schema.template_versions.template_id, archivedId)),0,'restoring lifecycle state must not invent a content version');
    assert.equal(await countRows(schema.audit_events, and(eq(schema.audit_events.resource_id, archivedId), eq(schema.audit_events.action, 'template.restored'))),atCap?0:1);
    if (atCap) assert.deepEqual(restored.details,{limit:1,current:1,resource:'templates'});
    assert.equal(row.version,1,'restore preserves the existing content version');
    scenarios.push(`template-restore-free-${atCap?'over':'under'}-cap`);
  }

  const cloneUnder = await createUser('clone-under');
  const cloneUnderCookie = await login(cloneUnder);
  const cloneResult = await api(cloneUnderCookie, '/api/templates/coverage-public/clone', {
    method: 'POST',
    body: { visibility: 'private' },
  });
  createdIds.push(cloneResult.id);
  assert.equal((await orm.select({ user_id: schema.templates.user_id }).from(schema.templates).where(eq(schema.templates.id, cloneResult.id)).limit(1))[0].user_id, cloneUnder.id);
  assert.equal(await countRows(schema.template_versions, eq(schema.template_versions.template_id, cloneResult.id)), 1);
  assert.equal(await countRows(schema.audit_events, and(eq(schema.audit_events.resource_id, cloneResult.id), eq(schema.audit_events.action, 'template.cloned'))), 1);
  scenarios.push('template-clone-free-under-cap');

  const cloneOver = await createUser('clone-over');
  await seedTemplate({ id: `${prefix}-clone-existing`, userId: cloneOver.id, slug: `${prefix}-clone-existing` });
  const cloneOverCookie = await login(cloneOver);
  const cloneBefore = await countRows(schema.templates, eq(schema.templates.user_id, cloneOver.id));
  const cloneDenied = await api(cloneOverCookie, '/api/templates/coverage-public/clone', {
    method: 'POST',
    status: 403,
    body: { visibility: 'private' },
  });
  assert.equal(cloneDenied.code, 'limit_reached');
  assert.equal(await countRows(schema.templates, eq(schema.templates.user_id, cloneOver.id)), cloneBefore);
  scenarios.push('template-clone-free-over-cap');

  const renameUser = await createUser('rename');
  const renameId = `${prefix}-rename-target`;
  const collisionSlug = `${prefix}-collision`;
  await seedTemplate({ id: renameId, userId: renameUser.id, slug: `${prefix}-rename-original` });
  await seedTemplate({ id: `${prefix}-collision-owner`, userId: 'coverage-owner', slug: collisionSlug, isPublic: 1 });
  const renameCookie = await login(renameUser);
  const collisionRename = await api(renameCookie, `/api/templates/${renameId}`, {
    method: 'PUT',
    body: { slug: collisionSlug, expected_version: 1 },
  });
  assert.equal(collisionRename.slug, `${collisionSlug}-${renameId.slice(0, 8)}`);
  assert.deepEqual(
    (await orm.select({ slug: schema.templates.slug, version: schema.templates.version }).from(schema.templates).where(eq(schema.templates.id, renameId)).limit(1))[0],
    { slug: collisionRename.slug, version: 2 },
  );
  const validSlug = `${prefix}-valid-rename`;
  const validRename = await api(renameCookie, `/api/templates/${renameId}`, {
    method: 'PUT',
    body: { slug: validSlug, expected_version: 2 },
  });
  assert.equal(validRename.slug, validSlug);
  assert.deepEqual(
    (await orm.select({ slug: schema.templates.slug, version: schema.templates.version }).from(schema.templates).where(eq(schema.templates.id, renameId)).limit(1))[0],
    { slug: validSlug, version: 3 },
  );
  assert.equal(await countRows(schema.template_versions, eq(schema.template_versions.template_id, renameId)), 2);
  scenarios.push('template-slug-collision-and-valid-rename');

  const restoreUnder = await createUser('restore-under');
  for (let index = 0; index < 2; index += 1) {
    await seedRun({ id: `${prefix}-restore-under-active-${index}`, userId: restoreUnder.id });
  }
  const restoreUnderId = `${prefix}-restore-under-archived`;
  await seedRun({ id: restoreUnderId, userId: restoreUnder.id, deletedAt: CREATED_AT });
  const restoreUnderCookie = await login(restoreUnder);
  await api(restoreUnderCookie, `/api/checklists/${restoreUnderId}/restore`, { method: 'POST', body: {} });
  assert.equal(await countRows(schema.checklist_runs, and(eq(schema.checklist_runs.user_id, restoreUnder.id), isNull(schema.checklist_runs.team_id), eq(schema.checklist_runs.status, 'in_progress'), isNull(schema.checklist_runs.deleted_at))), 3);
  assert.equal((await orm.select({ deleted_at: schema.checklist_runs.deleted_at }).from(schema.checklist_runs).where(eq(schema.checklist_runs.id, restoreUnderId)).limit(1))[0].deleted_at, null);
  scenarios.push('active-run-restore-free-under-cap');

  const restoreOver = await createUser('restore-over');
  for (let index = 0; index < 3; index += 1) {
    await seedRun({ id: `${prefix}-restore-over-active-${index}`, userId: restoreOver.id });
  }
  const restoreOverId = `${prefix}-restore-over-archived`;
  await seedRun({ id: restoreOverId, userId: restoreOver.id, deletedAt: CREATED_AT });
  const restoreOverCookie = await login(restoreOver);
  const restoreDenied = await api(restoreOverCookie, `/api/checklists/${restoreOverId}/restore`, { method: 'POST', body: {}, status: 403 });
  assert.equal(restoreDenied.code, 'limit_reached');
  assert.equal((await orm.select({ deleted_at: schema.checklist_runs.deleted_at }).from(schema.checklist_runs).where(eq(schema.checklist_runs.id, restoreOverId)).limit(1))[0].deleted_at, CREATED_AT);
  assert.equal(await countRows(schema.checklist_runs, and(eq(schema.checklist_runs.user_id, restoreOver.id), isNull(schema.checklist_runs.deleted_at))), 3);
  scenarios.push('active-run-restore-free-over-cap');

  const teamUser = await createUser('effective-team');
  const teamCookie = await login(teamUser);
  for (const [label, activeCount, expectedStatus] of [['under', 2, 200], ['over', 3, 403]]) {
    const teamId = `${prefix}-team-${label}`;
    const templateId = `${prefix}-team-template-${label}`;
    await seedTeam({ id: teamId, userId: teamUser.id });
    await seedTemplate({ id: templateId, userId: teamUser.id, teamId, slug: `${prefix}-team-template-${label}` });
    for (let index = 0; index < activeCount; index += 1) {
      await seedRun({ id: `${prefix}-team-${label}-active-${index}`, userId: teamUser.id, teamId, templateId });
    }
    const previousSharedId = `${prefix}-team-${label}-shared`;
    await seedRun({
      id: previousSharedId,
      userId: teamUser.id,
      teamId,
      templateId,
      isPublic: 1,
      shareToken: `${prefix}-team-${label}-old-share`,
    });
    const beforeRows = await countRows(schema.checklist_runs, eq(schema.checklist_runs.team_id, teamId));
    const result = await api(teamCookie, `/api/checklists/${templateId}/share`, {
      method: 'POST',
      status: expectedStatus,
      body: { runName: `Effective team ${label}` },
    });
    const afterRows = await countRows(schema.checklist_runs, eq(schema.checklist_runs.team_id, teamId));
    if (label === 'under') {
      assert.equal(afterRows, beforeRows + 1);
      assert.equal((await orm.select({ team_id: schema.checklist_runs.team_id }).from(schema.checklist_runs).where(eq(schema.checklist_runs.id, result.id)).limit(1))[0].team_id, teamId);
      assert.deepEqual(
        (await orm.select({ status: schema.checklist_runs.status, is_public: schema.checklist_runs.is_public }).from(schema.checklist_runs).where(eq(schema.checklist_runs.id, previousSharedId)).limit(1))[0],
        { status: 'completed', is_public: false },
      );
      createdIds.push(result.id);
      scenarios.push('effective-team-share-reactivation-free-under-cap');
    } else {
      assert.equal(result.code, 'limit_reached');
      assert.equal(afterRows, beforeRows);
      assert.deepEqual(
        (await orm.select({ status: schema.checklist_runs.status, is_public: schema.checklist_runs.is_public }).from(schema.checklist_runs).where(eq(schema.checklist_runs.id, previousSharedId)).limit(1))[0],
        { status: 'in_progress', is_public: true },
      );
      scenarios.push('effective-team-share-reactivation-free-over-cap');
    }
  }

  return {
    prefix,
    scenarios,
    counts: {
      scenarios: scenarios.length,
      syntheticRuntimeIds: new Set(createdIds).size,
      templateScenarios: scenarios.filter((name) => name.startsWith('template-')).length,
      activeRunScenarios: scenarios.filter((name) => name.includes('active-run') || name.includes('reactivation')).length,
    },
  };
}
