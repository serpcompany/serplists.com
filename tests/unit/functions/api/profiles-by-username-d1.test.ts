import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handleProfileByUsername } from '@functions/api/handlers/auth';
import { buildProfilePreviewPath } from '@/lib/routes';
import { createMigratedD1 } from '../../../fixtures/sqliteD1';

describe('GET /api/profiles/by-username casing, on the migrated tables with their real collation and index', () => {
  let database: ReturnType<typeof createMigratedD1>;
  let executed: Array<{ query: string; params: unknown[] }>;

  function addUser(id: string, username: string) {
    database.sqlite
      .prepare('INSERT INTO users (id, email, name, username) VALUES (?, ?, ?, ?)')
      .run(id, `${id}@example.com`, `Name ${id}`, username);
  }

  async function lookUp(username: string) {
    const url = new URL('http://localhost/api/profiles/by-username');
    url.searchParams.set('username', username);
    const env = {
      DB: {
        ...database.d1,
        prepare: (query: string) => {
          const prepared = database.d1.prepare(query);
          return {
            ...prepared,
            bind: (...params: unknown[]) => {
              executed.push({ query, params });
              return prepared.bind(...params);
            },
          };
        },
      },
    } as any;
    return handleProfileByUsername(new Request(url), env);
  }

  beforeEach(() => {
    database = createMigratedD1();
    executed = [];
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

  it('prefers the exact match when a legacy mixed-case and a lowercase account both exist', async () => {
    addUser('legacy', 'JaneDoe');
    addUser('newer', 'janedoe');

    expect(await (await lookUp('JaneDoe')).json()).toMatchObject({ id: 'legacy' });
    expect(await (await lookUp('janedoe')).json()).toMatchObject({ id: 'newer' });
    expect(await (await lookUp('JANEDOE')).json()).toMatchObject({ id: 'newer' });
  });

  it('resolves the Settings preview of an unedited legacy username to that user', async () => {
    addUser('legacy', 'JaneDoe');
    addUser('newer', 'janedoe');

    const previewPath = buildProfilePreviewPath('JaneDoe', 'JaneDoe');
    const previewUsername = decodeURIComponent(/^\/profile\/([^/]+)\/$/.exec(previewPath!)![1]!);

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

    const lookup = executed.find(({ query }) => query.includes('"username"'));
    expect(lookup).toBeDefined();
    const plan = database.sqlite
      .prepare(`EXPLAIN QUERY PLAN ${lookup!.query}`)
      .all(...(lookup!.params as string[]))
      .map((row) => String((row as { detail: string }).detail));
    expect(plan.join('\n')).toMatch(/USING (COVERING )?INDEX idx_users_username/);
    expect(plan.join('\n')).not.toMatch(/SCAN users/);
  });
});
