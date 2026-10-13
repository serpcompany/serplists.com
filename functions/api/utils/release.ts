import { releaseCommitFrom, releaseEnvironmentFrom, type Release } from '../../../src/lib/schemas/release';
import type { Env } from '../types';

export const currentRelease = (env: Pick<Env, 'SITE_ENV'>): Release => ({
  commit: releaseCommitFrom(process.env.NEXT_PUBLIC_RELEASE_COMMIT),
  environment: releaseEnvironmentFrom(env.SITE_ENV),
});
