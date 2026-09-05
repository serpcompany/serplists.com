import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const PASSWORD = 'password123';
const CREATED_AT = '2026-09-05';
const AUTH_TIME = 1788566400000;
const EMPTY_SECTIONS = JSON.stringify([{ id: 'limit-section', title: 'Limit Section', items: [] }]);

export async function runTemplateLimitCoverage({ mf, db }) {
  assert(mf?.dispatchFetch, 'runTemplateLimitCoverage requires the real Miniflare Worker');
  assert(db?.prepare, 'runTemplateLimitCoverage requires the real migrated D1 binding');
  assert(await db.prepare("SELECT id FROM users WHERE id = 'coverage-owner'").first(), 'coverage-owner fixture is required');
  assert(await db.prepare("SELECT id FROM templates WHERE id = 'coverage-public'").first(), 'coverage-public fixture is required');

  const prefix = `i127-template-limits-${randomUUID().slice(0, 8)}`;
  const createdIds = [];
  const scenarios = [];

  async function createUser(label) {
    const id = `${prefix}-${label}`;
    const email = `${id}@e2e.local`;
    await db.prepare(`
      INSERT INTO users (id, email, name, username, email_verified, created_at, auth_created_at, auth_updated_at)
      VALUES (?, ?, ?, ?, 1, ?, ?, ?)
    `).bind(id, email, `Issue 127 ${label}`, id.replaceAll('-', '_'), CREATED_AT, AUTH_TIME, AUTH_TIME).run();
    await db.prepare(`
      INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at)
      SELECT ?, ?, 'credential', ?, password, ?, ?
      FROM account WHERE user_id = 'coverage-owner' LIMIT 1
    `).bind(`${id}-credential`, id, id, AUTH_TIME, AUTH_TIME).run();
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

  async function scalar(sql, ...bindings) {
    const row = await db.prepare(sql).bind(...bindings).first();
    return Number(row?.count ?? 0);
  }

  async function seedTemplate({ id, userId, slug, teamId = null, isPublic = 0, rules = null }) {
    await db.prepare(`
      INSERT INTO templates (
        id, user_id, title, description, items, is_public, category, tags, slug,
        version, type, rules, owner_type, team_id, created_by_user_id, created_at
      ) VALUES (?, ?, ?, 'Issue 127 runtime coverage', ?, ?, '[]', '[]', ?, 1, 'checklist', ?, ?, ?, ?, ?)
    `).bind(
      id,
      userId,
      `Template ${id}`,
      EMPTY_SECTIONS,
      isPublic,
      slug,
      rules,
      teamId ? 'team' : 'user',
      teamId,
      userId,
      CREATED_AT,
    ).run();
    createdIds.push(id);
  }

  async function seedRun({ id, userId, teamId = null, templateId = null, deletedAt = null, isPublic = 0, shareToken = null }) {
    await db.prepare(`
      INSERT INTO checklist_runs (
        id, user_id, team_id, template_id, title, items, status, started_at, created_at,
        deleted_at, is_public, share_token, created_by_user_id, started_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, 'in_progress', ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, userId, teamId, templateId, `Run ${id}`, EMPTY_SECTIONS, CREATED_AT, CREATED_AT, deletedAt, isPublic, shareToken, userId, userId).run();
    createdIds.push(id);
  }

  async function seedTeam({ id, userId }) {
    await db.prepare(`
      INSERT INTO teams (id, name, slug, created_by_user_id, billing_owner_user_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(id, `Team ${id}`, id, userId, userId, CREATED_AT).run();
    await db.prepare(`
      INSERT INTO team_members (id, team_id, user_id, role, status, created_at)
      VALUES (?, ?, ?, 'editor', 'active', ?)
    `).bind(`${id}-membership`, id, userId, CREATED_AT).run();
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
  assert.equal(await scalar('SELECT COUNT(*) AS count FROM templates WHERE user_id = ? AND deleted_at IS NULL', createUnder.id), 1);
  assert.equal(await scalar('SELECT COUNT(*) AS count FROM template_versions WHERE template_id = ?', createResult.id), 1);
  assert.equal(await scalar("SELECT COUNT(*) AS count FROM audit_events WHERE resource_id = ? AND action = 'template.created'", createResult.id), 1);
  scenarios.push('template-create-free-under-cap');

  const createOver = await createUser('create-over');
  await seedTemplate({ id: `${prefix}-create-existing`, userId: createOver.id, slug: `${prefix}-create-existing` });
  const createOverCookie = await login(createOver);
  const createBefore = await scalar('SELECT COUNT(*) AS count FROM templates WHERE user_id = ?', createOver.id);
  const createDenied = await api(createOverCookie, '/api/templates', {
    method: 'POST',
    status: 403,
    body: templatePayload('Create Over Limit', `${prefix}-create-denied`),
  });
  assert.equal(createDenied.code, 'limit_reached');
  assert.deepEqual(createDenied.details, { limit: 1, current: 1, resource: 'templates' });
  assert.equal(await scalar('SELECT COUNT(*) AS count FROM templates WHERE user_id = ?', createOver.id), createBefore);
  scenarios.push('template-create-free-over-cap');

  for (const atCap of [false,true]) {
    const actor = await createUser(`template-restore-${atCap ? 'over' : 'under'}`);
    const archivedId = `${actor.id}-archived`;
    await seedTemplate({id:archivedId,userId:actor.id,slug:archivedId});
    await db.prepare('UPDATE templates SET deleted_at = ? WHERE id = ?').bind(CREATED_AT,archivedId).run();
    if (atCap) await seedTemplate({id:`${actor.id}-active`,userId:actor.id,slug:`${actor.id}-active`});
    const actorCookie = await login(actor);
    const restored = await api(actorCookie,`/api/templates/${archivedId}/restore`,{method:'POST',body:{},status:atCap?403:200});
    const row = await db.prepare('SELECT deleted_at,version,user_id FROM templates WHERE id = ?').bind(archivedId).first();
    assert.equal(row.user_id,actor.id);
    assert.equal(row.deleted_at,atCap?CREATED_AT:null);
    assert.equal(await scalar('SELECT COUNT(*) AS count FROM templates WHERE user_id = ? AND deleted_at IS NULL',actor.id),1);
    assert.equal(await scalar('SELECT COUNT(*) AS count FROM template_versions WHERE template_id = ?',archivedId),0,'restoring lifecycle state must not invent a content version');
    assert.equal(await scalar("SELECT COUNT(*) AS count FROM audit_events WHERE resource_id = ? AND action = 'template.restored'",archivedId),atCap?0:1);
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
  assert.equal((await db.prepare('SELECT user_id FROM templates WHERE id = ?').bind(cloneResult.id).first()).user_id, cloneUnder.id);
  assert.equal(await scalar('SELECT COUNT(*) AS count FROM template_versions WHERE template_id = ?', cloneResult.id), 1);
  assert.equal(await scalar("SELECT COUNT(*) AS count FROM audit_events WHERE resource_id = ? AND action = 'template.cloned'", cloneResult.id), 1);
  scenarios.push('template-clone-free-under-cap');

  const cloneOver = await createUser('clone-over');
  await seedTemplate({ id: `${prefix}-clone-existing`, userId: cloneOver.id, slug: `${prefix}-clone-existing` });
  const cloneOverCookie = await login(cloneOver);
  const cloneBefore = await scalar('SELECT COUNT(*) AS count FROM templates WHERE user_id = ?', cloneOver.id);
  const cloneDenied = await api(cloneOverCookie, '/api/templates/coverage-public/clone', {
    method: 'POST',
    status: 403,
    body: { visibility: 'private' },
  });
  assert.equal(cloneDenied.code, 'limit_reached');
  assert.equal(await scalar('SELECT COUNT(*) AS count FROM templates WHERE user_id = ?', cloneOver.id), cloneBefore);
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
    await db.prepare('SELECT slug, version FROM templates WHERE id = ?').bind(renameId).first(),
    { slug: collisionRename.slug, version: 2 },
  );
  const validSlug = `${prefix}-valid-rename`;
  const validRename = await api(renameCookie, `/api/templates/${renameId}`, {
    method: 'PUT',
    body: { slug: validSlug, expected_version: 2 },
  });
  assert.equal(validRename.slug, validSlug);
  assert.deepEqual(
    await db.prepare('SELECT slug, version FROM templates WHERE id = ?').bind(renameId).first(),
    { slug: validSlug, version: 3 },
  );
  assert.equal(await scalar('SELECT COUNT(*) AS count FROM template_versions WHERE template_id = ?', renameId), 2);
  scenarios.push('template-slug-collision-and-valid-rename');

  const restoreUnder = await createUser('restore-under');
  for (let index = 0; index < 2; index += 1) {
    await seedRun({ id: `${prefix}-restore-under-active-${index}`, userId: restoreUnder.id });
  }
  const restoreUnderId = `${prefix}-restore-under-archived`;
  await seedRun({ id: restoreUnderId, userId: restoreUnder.id, deletedAt: CREATED_AT });
  const restoreUnderCookie = await login(restoreUnder);
  await api(restoreUnderCookie, `/api/checklists/${restoreUnderId}/restore`, { method: 'POST', body: {} });
  assert.equal(await scalar("SELECT COUNT(*) AS count FROM checklist_runs WHERE user_id = ? AND team_id IS NULL AND status = 'in_progress' AND deleted_at IS NULL", restoreUnder.id), 3);
  assert.equal((await db.prepare('SELECT deleted_at FROM checklist_runs WHERE id = ?').bind(restoreUnderId).first()).deleted_at, null);
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
  assert.equal((await db.prepare('SELECT deleted_at FROM checklist_runs WHERE id = ?').bind(restoreOverId).first()).deleted_at, CREATED_AT);
  assert.equal(await scalar("SELECT COUNT(*) AS count FROM checklist_runs WHERE user_id = ? AND deleted_at IS NULL", restoreOver.id), 3);
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
    const beforeRows = await scalar('SELECT COUNT(*) AS count FROM checklist_runs WHERE team_id = ?', teamId);
    const result = await api(teamCookie, `/api/checklists/${templateId}/share`, {
      method: 'POST',
      status: expectedStatus,
      body: { runName: `Effective team ${label}` },
    });
    const afterRows = await scalar('SELECT COUNT(*) AS count FROM checklist_runs WHERE team_id = ?', teamId);
    if (label === 'under') {
      assert.equal(afterRows, beforeRows + 1);
      assert.equal((await db.prepare('SELECT team_id FROM checklist_runs WHERE id = ?').bind(result.id).first()).team_id, teamId);
      assert.deepEqual(
        await db.prepare('SELECT status, is_public FROM checklist_runs WHERE id = ?').bind(previousSharedId).first(),
        { status: 'completed', is_public: 0 },
      );
      createdIds.push(result.id);
      scenarios.push('effective-team-share-reactivation-free-under-cap');
    } else {
      assert.equal(result.code, 'limit_reached');
      assert.equal(afterRows, beforeRows);
      assert.deepEqual(
        await db.prepare('SELECT status, is_public FROM checklist_runs WHERE id = ?').bind(previousSharedId).first(),
        { status: 'in_progress', is_public: 1 },
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
