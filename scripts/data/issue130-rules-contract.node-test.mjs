import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const repoRoot = process.cwd();
const migrationFiles = readdirSync(path.join(repoRoot, 'db/migrations'))
  .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name))
  .sort();

async function buildApiWorker() {
  const require = createRequire(path.join(repoRoot, 'package.json'));
  const wranglerRequire = createRequire(require.resolve('wrangler/package.json'));
  const { build } = wranglerRequire('esbuild');
  const result = await build({
    stdin: {
      contents: "import api from './functions/api/[[route]].ts'; export default api;",
      resolveDir: repoRoot,
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    conditions: ['workerd', 'worker', 'browser'],
    external: ['node:*'],
    target: 'es2022',
    logLevel: 'silent',
  });
  return { Miniflare: wranglerRequire('miniflare').Miniflare, script: result.outputFiles[0].text };
}

async function request(mf, route, { method = 'GET', body, cookie = '', status = 200 } = {}) {
  const response = await mf.dispatchFetch(`http://localhost${route}`, {
    method,
    redirect: 'manual',
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      Origin: 'http://localhost',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  assert.equal(response.status, status, `${method} ${route}: ${text.slice(0, 500)}`);
  return { response, text, json: () => JSON.parse(text) };
}

test('issue130: every supported source profile contains rules and missing rules fails closed', async () => {
  const rulesIndex = migrationFiles.indexOf('0020_add_template_rules.sql');
  assert(rulesIndex >= 0, 'rules creating migration must exist');
  for (const supportedSource of ['0023_add_sitemap_revision_state.sql', '0024_safe_template_evolution.sql']) {
    assert(
      migrationFiles.indexOf(supportedSource) > rulesIndex,
      `rules migration must predate supported source ${supportedSource}`,
    );
  }

  const { Miniflare, script } = await buildApiWorker();
  const directory = mkdtempSync(path.join(tmpdir(), 'serplists-rules-contract-'));
  const databaseId = '11111111-1111-4111-8111-111111111111';
  let mf;
  try {
    const config = path.join(directory, 'wrangler.toml');
    writeFileSync(config, `name="rules-contract"\ncompatibility_date="2025-12-01"\n[[d1_databases]]\nbinding="DB"\ndatabase_name="rules-contract"\ndatabase_id="${databaseId}"\nmigrations_dir=${JSON.stringify(path.join(repoRoot,'db/migrations'))}\n`);
    const cli = path.join(repoRoot,'node_modules/wrangler/bin/wrangler.js');
    for (const args of [
      ['d1','migrations','apply','rules-contract','--local','--config',config],
      ['d1','execute','rules-contract','--local','--config',config,'--file',path.join(repoRoot,'scripts/data/sql/route-coverage-fixtures.sql'),'--yes'],
    ]) execFileSync(process.execPath,[cli,...args],{cwd:directory,env:{PATH:process.env.PATH,CI:'true',WRANGLER_SEND_METRICS:'false',WRANGLER_LOG_PATH:path.join(directory,'wrangler.log')},stdio:'pipe'});
    mf = new Miniflare({
    modules: true,
    script,
    compatibilityDate: '2025-12-01',
    compatibilityFlags: ['nodejs_compat'],
    d1Databases: { DB: databaseId },
    d1Persist: path.join(directory,'.wrangler/state/v3/d1'),
    bindings: {
      BETTER_AUTH_SECRET: 'issue130-local-secret-at-least-32-characters',
      FRONTEND_URL: 'http://localhost',
    },
  });

    const db = await mf.getD1Database('DB');
    assert.deepEqual((await db.prepare('SELECT name FROM d1_migrations ORDER BY id').all()).results.map(row=>row.name),migrationFiles);

    const login = await request(mf, '/api/auth/sign-in/email', {
      method: 'POST',
      body: { email: 'coverage-owner@e2e.local', password: 'password123' },
    });
    const cookie = login.response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
    assert(cookie.includes('session_token'), 'real Better Auth login must issue a session cookie');

    const rule = { id: 'issue130-required-title', type: 'required', path: 'title', severity: 'error' };
    const created = (await request(mf, '/api/templates', {
      method: 'POST',
      cookie,
      body: {
        title: 'Issue 130 Rules Contract',
        slug: 'issue130-rules-contract',
        is_public: true,
        rules: [rule],
        sections: [{ id: 'issue130-section', title: 'Section', items: [] }],
      },
    })).json();
    const createdId = created.id;
    assert.equal((await db.prepare('SELECT rules FROM templates WHERE id = ?').bind(createdId).first()).rules, JSON.stringify([rule]));
    assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM template_versions WHERE template_id = ?').bind(createdId).first()).count, 1);
    assert.equal((await db.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE resource_type = 'template' AND resource_id = ?").bind(createdId).first()).count, 1);

    const read = (await request(mf, `/api/templates/${createdId}`, { cookie })).json();
    assert.deepEqual(read.rules, [rule]);
    await request(mf, `/api/templates/${createdId}`, {
      method: 'PUT',
      cookie,
      body: { description: 'Updated with mandatory rules intact', expected_version: 1 },
    });
    assert.equal((await db.prepare('SELECT version, rules FROM templates WHERE id = ?').bind(createdId).first()).rules, JSON.stringify([rule]));
    const cloned = (await request(mf, `/api/templates/${createdId}/clone`, {
      method: 'POST',
      cookie,
      body: { visibility: 'private' },
    })).json();
    assert.equal((await db.prepare('SELECT rules FROM templates WHERE id = ?').bind(cloned.id).first()).rules, JSON.stringify([rule]));
    const backup = (await request(mf, '/api/templates/backup?format=backup', { cookie })).json();
    assert.deepEqual(backup.templates.find((template) => template.id === createdId).rules, [rule]);

    const before = await db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM templates WHERE user_id = 'coverage-owner') AS templates,
        (SELECT COUNT(*) FROM template_versions WHERE changed_by_user_id = 'coverage-owner') AS versions,
        (SELECT COUNT(*) FROM audit_events WHERE actor_user_id = 'coverage-owner') AS audits
    `).first();
    await db.exec('ALTER TABLE templates DROP COLUMN rules');

    await request(mf, '/api/templates', {
      method: 'POST',
      cookie,
      status: 500,
      body: {
        title: 'Issue 130 Must Fail Closed',
        sections: [{ id: 'issue130-negative-section', title: 'Section', items: [] }],
      },
    });
    const after = await db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM templates WHERE user_id = 'coverage-owner') AS templates,
        (SELECT COUNT(*) FROM template_versions WHERE changed_by_user_id = 'coverage-owner') AS versions,
        (SELECT COUNT(*) FROM audit_events WHERE actor_user_id = 'coverage-owner') AS audits
    `).first();
    assert.deepEqual(after, before, 'missing rules must not partially write template, version, or audit rows');
  } finally {
    if (mf) await mf.dispose();
    rmSync(directory,{recursive:true,force:true});
  }
});
