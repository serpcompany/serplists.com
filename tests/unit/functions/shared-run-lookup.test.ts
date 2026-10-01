import { beforeEach, describe, expect, it } from 'vitest';
import { loadSharedRunTitle } from '../../../functions/seo/shared-run-lookup';
import type { Env } from '../../../functions/api/types';
import { SqliteD1 } from '../../support/sqlite-d1';

const NOW = '2026-09-30T00:00:00.000Z';

describe('loadSharedRunTitle', () => {
  let database: SqliteD1;
  const env = () => ({ DB: database.binding }) as unknown as Env;

  const addRun = (id: string, { isPublic = 1, deletedAt = null as string | null } = {}) =>
    database.sqlite
      .prepare(
        `INSERT INTO checklist_runs (id, user_id, title, items, started_at, created_at, is_public, share_token, deleted_at)
         VALUES (?, 'owner', ?, '[]', ?, ?, ?, ?, ?)`,
      )
      .run(id, `Run ${id}`, NOW, NOW, isPublic, `token-${id}`, deletedAt);

  beforeEach(() => {
    database = new SqliteD1();
    database.sqlite
      .prepare("INSERT INTO users (id, email, name, email_verified, created_at) VALUES ('owner', 'owner@example.test', 'Owner', 1, ?)")
      .run(NOW);
  });

  it('names the run an active share link opens', async () => {
    addRun('shared');

    await expect(loadSharedRunTitle(env(), ' token-shared ')).resolves.toBe('Run shared');
  });

  it('names nothing once sharing stops or the run is archived, reading D1 each time so a revoked link stops at once', async () => {
    addRun('stopped', { isPublic: 0 });
    addRun('archived', { deletedAt: NOW });
    addRun('revoked-later');

    await expect(loadSharedRunTitle(env(), 'token-stopped')).resolves.toBeNull();
    await expect(loadSharedRunTitle(env(), 'token-archived')).resolves.toBeNull();
    await expect(loadSharedRunTitle(env(), 'token-revoked-later')).resolves.toBe('Run revoked-later');
    database.sqlite.prepare("UPDATE checklist_runs SET is_public = 0 WHERE id = 'revoked-later'").run();
    await expect(loadSharedRunTitle(env(), 'token-revoked-later')).resolves.toBeNull();
    await expect(loadSharedRunTitle(env(), '   ')).resolves.toBeNull();
  });
});
