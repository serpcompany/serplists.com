import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

import { normalizePublicHandle, publicHandleSchema } from '@/lib/schemas/publicHandle';

describe('the public handle rule Users and Organizations share', () => {
  it.each(['abc', 'Jane.Doe', 'jane_doe', 'jane-doe', 'A1b2C3', 'a'.repeat(30)])('accepts %j', (value) => {
    expect(publicHandleSchema.safeParse(value).success).toBe(true);
  });

  it.each(['ab', 'a'.repeat(31), 'jane doe', 'jane@doe', 'café', ''])('refuses %j', (value) => {
    expect(publicHandleSchema.safeParse(value).success).toBe(false);
  });

  it('compares handles as the database does: ASCII letters lowercased and surrounding spaces dropped', () => {
    expect(normalizePublicHandle('  Jane.Doe ')).toBe('jane.doe');
    expect(normalizePublicHandle('ÉCOLE')).toBe('École');
  });

  it("matches the lower(trim(...)) key the registry's triggers write", () => {
    const sqlite = new DatabaseSync(':memory:');

    for (const value of ['  Jane.Doe ', 'ÉCOLE', 'MiXeD-Case_1', '	Tab ']) {
      expect(normalizePublicHandle(value)).toBe(sqlite.prepare('SELECT lower(trim(?)) AS handle').get(value)?.['handle']);
    }
  });
});
