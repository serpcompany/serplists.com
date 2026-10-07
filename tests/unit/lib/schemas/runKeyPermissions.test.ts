import { describe, expect, it } from 'vitest';

import {
  DEFAULT_RUN_KEY_PERMISSIONS,
  parseStoredRunKeyPermissions,
  toggleRunKeyPermission,
  withImpliedRunKeyPermissions,
} from '@/lib/schemas/runKeyPermissions';

import { SqliteD1 } from '../../../support/sqlite-d1';

describe('Run Key permissions', () => {
  it('adds the read that each write implies and keeps a stable order', () => {
    expect(withImpliedRunKeyPermissions(['runs:write', 'templates:write'])).toEqual([
      'templates:read',
      'templates:write',
      'runs:read',
      'runs:write',
    ]);
  });

  it('defaults to what keys could do before template writes existed', () => {
    expect(DEFAULT_RUN_KEY_PERMISSIONS).toEqual(['templates:read', 'runs:read', 'runs:write']);
  });

  it('defaults to the permissions column default that migration 0027 gave every earlier key', () => {
    const database = new SqliteD1();
    database.run(
      `INSERT INTO users (id, email, name, email_verified, created_at, updated_at)
        VALUES ('user-1', 'owner@example.test', 'Owner', 1, '2026-01-01', '2026-01-01')`,
    );
    database.run(
      `INSERT INTO personal_run_keys (id, user_id, name, key_prefix, key_hash)
        VALUES ('key-1', 'user-1', 'Made before key permissions', 'slrk_example', 'stored-hash')`,
    );
    const [key] = database.rows<{ permissions: string }>("SELECT permissions FROM personal_run_keys WHERE id = 'key-1'");

    expect(JSON.parse(key?.permissions ?? 'null')).toEqual([...DEFAULT_RUN_KEY_PERMISSIONS]);
  });

  it('treats writing runs as reading templates, because a new run copies template content', () => {
    expect(withImpliedRunKeyPermissions(['runs:write'])).toEqual(['templates:read', 'runs:read', 'runs:write']);
    expect(toggleRunKeyPermission(['templates:read', 'runs:read', 'runs:write'], 'templates:read', false))
      .toEqual(['runs:read']);
  });

  it('turns on the implied read and turns off writes that depend on a removed read', () => {
    expect(toggleRunKeyPermission(['runs:read'], 'templates:write', true)).toEqual([
      'templates:read',
      'templates:write',
      'runs:read',
    ]);
    expect(toggleRunKeyPermission(['templates:read', 'templates:write', 'runs:read'], 'templates:read', false))
      .toEqual(['runs:read']);
    expect(toggleRunKeyPermission(['templates:read', 'templates:write'], 'templates:write', false))
      .toEqual(['templates:read']);
  });

  it('grants nothing for malformed stored values and drops unknown entries', () => {
    expect(parseStoredRunKeyPermissions('not json')).toEqual([]);
    expect(parseStoredRunKeyPermissions('{"runs:read":true}')).toEqual([]);
    expect(parseStoredRunKeyPermissions(null)).toEqual([]);
    expect(parseStoredRunKeyPermissions('["templates:delete","runs:read"]')).toEqual(['runs:read']);
  });
});
