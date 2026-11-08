import { existsSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import drizzleConfig from '../../../db/drizzle.config';

describe('the drizzle-kit config', () => {
  it('reads the schema index and writes SQLite migrations into the folder the local and remote D1 apply', () => {
    expect(drizzleConfig.dialect).toBe('sqlite');
    expect(drizzleConfig.schema).toBe('./db/schema/index.ts');
    expect(existsSync(String(drizzleConfig.schema))).toBe(true);
    expect(drizzleConfig.out).toBe('./db/migrations');
    expect(readdirSync(String(drizzleConfig.out)).some((name) => name.endsWith('.sql'))).toBe(true);
  });
});
