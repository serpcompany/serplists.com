import { z } from 'zod';

export const RELEASE_META_NAME = 'serplists-release';

const UNKNOWN_RELEASE_COMMIT = 'unknown';

const RELEASE_ENVIRONMENTS = ['production', 'staging', 'local'] as const;

export const releaseCommitSchema = z
  .string()
  .regex(/^[0-9a-f]{7,64}$/, 'NEXT_PUBLIC_RELEASE_COMMIT must be a git commit SHA: 7 to 64 lowercase hex characters');

export const reportedCommitSchema = z.union([releaseCommitSchema, z.literal(UNKNOWN_RELEASE_COMMIT)]);

const releaseSchema = z.object({ commit: reportedCommitSchema, environment: z.enum(RELEASE_ENVIRONMENTS) });

export type Release = z.infer<typeof releaseSchema>;

export const healthResponseSchema = z.object({ status: z.literal('ok'), release: releaseSchema });

export const releaseCommitFrom = (value: string | undefined): string => {
  const commit = releaseCommitSchema.safeParse(value);
  return commit.success ? commit.data : UNKNOWN_RELEASE_COMMIT;
};

export const releaseEnvironmentFrom = (siteEnv: string | undefined): Release['environment'] =>
  siteEnv === 'production' || siteEnv === 'staging' ? siteEnv : 'local';
