import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { readWranglerToml, type WranglerEnvironment } from '../../support/wranglerToml';

const deployedEnvironment = z.object({
  workers_dev: z.boolean(),
  preview_urls: z.boolean(),
  d1_databases: z.array(z.object({ binding: z.string(), database_name: z.string(), database_id: z.string() })),
  r2_buckets: z.array(z.object({ binding: z.string(), bucket_name: z.string() })),
});

const ENVIRONMENTS = [
  { name: 'staging', wranglerEnv: 'preview', database: 'serp-checklists-staging-db', bucket: 'serp-checklists-staging-uploads' },
  { name: 'production', wranglerEnv: 'production', database: 'serp-checklists-db', bucket: 'serp-checklists-uploads' },
] as const;

const bindingsOf = (wranglerEnv: WranglerEnvironment) => deployedEnvironment.parse(readWranglerToml().env[wranglerEnv]);

describe.each(ENVIRONMENTS)('the $name Worker', ({ name, wranglerEnv, database, bucket }) => {
  const bindings = bindingsOf(wranglerEnv);
  const others = ENVIRONMENTS.filter((other) => other.name !== name).map((other) => bindingsOf(other.wranglerEnv));

  it(`binds DB to ${database} and R2_UPLOADS to ${bucket}, and nothing else of either kind`, () => {
    expect(bindings.d1_databases).toEqual([expect.objectContaining({ binding: 'DB', database_name: database })]);
    expect(bindings.r2_buckets).toEqual([{ binding: 'R2_UPLOADS', bucket_name: bucket }]);
  });

  it("shares no database and no bucket with the other environment, so a test upload or write never reaches another's data", () => {
    for (const other of others) {
      for (const { database_id: id, database_name: databaseName } of other.d1_databases) {
        expect(bindings.d1_databases.map((binding) => binding.database_id)).not.toContain(id);
        expect(bindings.d1_databases.map((binding) => binding.database_name)).not.toContain(databaseName);
      }
      for (const { bucket_name: otherBucket } of other.r2_buckets) {
        expect(bindings.r2_buckets.map((binding) => binding.bucket_name)).not.toContain(otherBucket);
      }
    }
  });

  it('keeps the workers.dev address CI tests through, and serves no version preview URLs', () => {
    expect(bindings.workers_dev).toBe(true);
    expect(bindings.preview_urls).toBe(false);
  });
});
