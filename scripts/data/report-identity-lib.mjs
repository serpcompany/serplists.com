import { readFileSync, readdirSync } from 'node:fs';
import { loadEnvironmentInventory, validateEnvironmentInventory } from './environment-identity-lib.mjs';
import { normalizeMigrationRange, migrationRangesEqual, migrationsInRange } from './migration-range-lib.mjs';

/** Validate release report identity against the checked-out environment contract. */
export function validateReportIdentity({ commit, target, migrationRange }, expected) {
  const repoRoot = new URL('../..', import.meta.url).pathname;
  const inventory = loadEnvironmentInventory({ repoRoot });
  validateEnvironmentInventory({ inventory, wranglerToml: readFileSync(new URL('../../wrangler.toml', import.meta.url), 'utf8') });
  const known = inventory.environments[target?.environment];
  if (!/^[a-f0-9]{40}$/.test(commit ?? '') || /^0{40}$/.test(commit) || !['staging','production'].includes(target?.environment) || target?.binding !== inventory.binding || !known || target.databaseName !== known.databaseName || target.databaseId !== known.databaseId) throw new Error('Release report identity is missing or does not match the environment contract.');
  const identity = { commit, target: { environment: target.environment, binding: target.binding, databaseName: target.databaseName, databaseId: target.databaseId }, migrationRange: normalizeMigrationRange(migrationRange) };
  migrationsInRange(readdirSync(new URL('../../db/migrations/', import.meta.url)).filter(name => /^\d{4}_.+\.sql$/.test(name)).sort(), identity.migrationRange);
  if (expected && (identity.commit !== expected.commit || ['environment','binding','databaseName','databaseId'].some(key => identity.target[key] !== expected.target?.[key]) || !migrationRangesEqual(identity.migrationRange, expected.migrationRange))) throw new Error('Release report identity or reviewed migration range does not match its evidence.');
  return identity;
}

export function reportIdentitySummary(report) {
  return `commit ${report.commit}; environment ${report.target?.environment}; binding ${report.target?.binding}; database ${report.target?.databaseName} (${report.target?.databaseId}); migrations ${report.migrationRange?.from ?? 'none'} -> ${report.migrationRange?.to ?? 'none'}`;
}
