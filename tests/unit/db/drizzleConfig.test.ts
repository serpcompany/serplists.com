import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import drizzleConfig from '../../../db/drizzle.config';
import { readWranglerToml } from '../../support/wranglerToml';

const migrationsFolder = z.object({ migrations_dir: z.string() });

const foldersTheD1DatabasesApply = () => {
  const wrangler = readWranglerToml();
  return [...wrangler.d1_databases, ...wrangler.env.preview.d1_databases, ...wrangler.env.production.d1_databases].map(
    (database) => path.resolve(migrationsFolder.parse(database).migrations_dir),
  );
};

describe('the drizzle-kit config', () => {
  it('reads a schema index that exists and writes migrations into the folder every local and deployed D1 applies', () => {
    expect(existsSync(String(drizzleConfig.schema))).toBe(true);
    expect(new Set(foldersTheD1DatabasesApply())).toEqual(new Set([path.resolve(String(drizzleConfig.out))]));
    expect(readdirSync(String(drizzleConfig.out)).some((name) => name.endsWith('.sql'))).toBe(true);
  });
});
