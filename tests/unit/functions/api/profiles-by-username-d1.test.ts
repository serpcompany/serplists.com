import { afterEach, assert, beforeEach, describe, expect, it } from 'vitest';
import { capturedGroup } from '../../../support/elements';
import { handleProfileByUsername } from '@functions/api/handlers/auth';
import { buildProfilePreviewPath } from '@/lib/routes';
import { apiEnv } from '../../../support/apiEnv';
import { SqliteD1 } from '../../../support/sqlite-d1';

describe('GET /api/profiles/by-username casing, on the migrated tables with their real collation and index', () => {
  let database: SqliteD1;

  function addUser(id: string, username: string) {
    database.sqlite
      .prepare('INSERT INTO users (id, email, name, username) VALUES (?, ?, ?, ?)')
      .run(id, `${id}@example.com`, `Name ${id}`, username);
  }

  async function lookUp(username: string) {
    const url = new URL('http://localhost/api/profiles/by-username');
    url.searchParams.set('username', username);
    return handleProfileByUsername(new Request(url), apiEnv({ DB: database.binding }));
  }

  beforeEach(() => {
    database = new SqliteD1();
    addUser('john', 'johndoe');
  });

  afterEach(() => {
    database.sqlite.close();
  });

  it.each(['johndoe', 'JohnDoe', 'JOHNDOE', '  JohnDoe  '])('finds the stored lowercase username from %j', async (typed) => {
    const response = await lookUp(typed);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: 'john', username: 'johndoe' });
  });

  it('still finds a legacy mixed-case username saved before usernames were lowercased', async () => {
    addUser('legacy', 'MixedCase');

    const response = await lookUp('MixedCase');

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: 'legacy' });
  });

  it('refuses a second account whose username differs from a legacy one only in case, so the legacy profile keeps its URL', async () => {
    addUser('legacy', 'JaneDoe');

    expect(() => addUser('newer', 'janedoe')).toThrow(/UNIQUE constraint failed: public_handles\.handle/);
    expect(await (await lookUp('JaneDoe')).json()).toMatchObject({ id: 'legacy' });
  });

  it('resolves the Settings preview of an unedited legacy username to that user', async () => {
    addUser('legacy', 'JaneDoe');

    const previewPath = buildProfilePreviewPath('JaneDoe', 'JaneDoe');
    assert.exists(previewPath);
    const previewUsername = decodeURIComponent(capturedGroup(/^\/profile\/([^/]+)\/$/.exec(previewPath), 1));

    expect(await (await lookUp(previewUsername)).json()).toMatchObject({ id: 'legacy' });
  });

  it.each(['', '   '])('answers 400 for the blank username %j', async (typed) => {
    expect((await lookUp(typed)).status).toBe(400);
  });

  it('answers 404 for an unknown username', async () => {
    expect((await lookUp('nobody')).status).toBe(404);
  });

  it('looks the username up through idx_users_username, not a table scan', async () => {
    await lookUp('JohnDoe');

    const lookup = database.queries.find(({ sql }) => sql.includes('"username"'));
    assert.exists(lookup);
    const plan = database.queryPlan(lookup);
    expect(plan.join('\n')).toMatch(/USING (COVERING )?INDEX idx_users_username/);
    expect(plan.join('\n')).not.toMatch(/SCAN users/);
  });
});
