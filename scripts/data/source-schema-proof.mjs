import { digest, assertRepositoryAppliedPrefix } from './production-preparation-lib.mjs';

export function sourceSchemaBinding({ commit, database, appliedMigrations, pendingMigrations, ledgerSha256 }) {
  assertRepositoryAppliedPrefix({ appliedMigrations, pendingMigrations, ledgerSha256 });
  if (!/^[a-f0-9]{40}$/.test(commit ?? '') ||
      typeof database?.databaseName !== 'string' || !database.databaseName ||
      typeof database?.databaseId !== 'string' || !database.databaseId) throw new Error('Source schema requires an exact commit and database identity.');
  return { commit, database: { databaseName: database.databaseName, databaseId: database.databaseId }, ledgerSha256,
    appliedThrough: appliedMigrations.at(-1) ?? null,
    migrationRange: { from: pendingMigrations[0] ?? null, to: pendingMigrations.at(-1) ?? null } };
}

export function assertSourceSchemaProof(proof, binding) {
  const expected = sourceSchemaBinding(binding);
  if (proof?.type !== 'source-schema' || proof.verdict !== 'pass' ||
      !Number.isInteger(proof.objectCount) || proof.objectCount < 0 ||
      !/^[a-f0-9]{64}$/.test(proof.catalogSha256 ?? '') ||
      Object.entries(expected).some(([key, value]) => JSON.stringify(proof[key]) !== JSON.stringify(value)) ||
      proof.proofSha256 !== digest({ ...expected, catalogSha256: proof.catalogSha256, objectCount: proof.objectCount })) {
    throw new Error('Source schema proof is missing or does not bind the reviewed source.');
  }
}
