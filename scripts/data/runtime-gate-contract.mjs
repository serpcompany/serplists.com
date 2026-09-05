import { normalizeMigrationRange, migrationRangesEqual } from './migration-range-lib.mjs';

export function assertSourceHandlerProofTap(output) {
  const lines = String(output).replaceAll('\r', '').split('\n');
  const count = name => {
    const matches = lines.filter(line => line.startsWith(`# ${name} `));
    return matches.length === 1 ? Number(matches[0].slice(name.length + 3)) : NaN;
  };
  const names = [
    'synthetic source with malformed retired content produces refusal and unchanged proof alongside healthy writes',
    'explicit no-eligible synthetic source fails without a pass artifact',
    'missing column in the imported-row consuming page fails the ordinary browser detector',
  ];
  if (!names.every(name => lines.some(line => /^ok \d+ - /.test(line) && line.replace(/^ok \d+ - /, '') === name)) ||
      count('tests') < 3 || !Number.isSafeInteger(count('tests')) || count('pass') !== count('tests') ||
      ['fail', 'cancelled', 'skipped', 'todo'].some(name => count(name) !== 0)) {
    throw new Error('Mandatory source-handler regression controls are missing, skipped, or failed.');
  }
  return true;
}

// Mandatory runs accept no Playwright selectors or configuration overrides.
// Developers may explicitly request an isolated, non-gating diagnostic run.
export function browserGateArguments(args) {
  if (args[0] === '--diagnostic-selection') return { gating: false, args: args.slice(1) };
  if (args.length) throw new Error('Mandatory E2E coverage cannot be selected or overridden. Use --diagnostic-selection for a non-gating isolated run.');
  return { gating: true, args: [] };
}

export function assertRuntimeRangeBinding(report, selectedRange) {
  const expected = normalizeMigrationRange(selectedRange);
  if (!report || typeof report !== 'object' || !Object.hasOwn(report, 'migrationRange')) throw new Error('Runtime evidence is missing its migration range.');
  function visit(value) {
    if (!value || typeof value !== 'object') return;
    if (Object.hasOwn(value, 'migrationRange') && !migrationRangesEqual(value.migrationRange, expected)) throw new Error('Runtime evidence contains a mismatched selected migration range.');
    for (const child of Object.values(value)) visit(child);
  }
  visit(report);
  return true;
}

export function validateFullExportRecoveryProof(recovery, commit) {
  const expected = ['original-source:pre0024','prepared-target:pre0024','original-source:post0024','prepared-target:post0024'];
  const observed = recovery?.restorations?.map(row => `${row.kind}:${row.sourceBoundary}`);
  return recovery?.verdict === 'pass' && recovery.commit === commit
    && recovery.target?.environment === 'local' && recovery.target?.synthetic === true
    && recovery.target?.binding === 'DB' && recovery.target?.databaseName === 'serp-checklists-db'
    && recovery.target?.databaseId === 'local:miniflare:full-export-recovery'
    && typeof recovery.migrationRange?.from === 'string' && typeof recovery.migrationRange?.to === 'string'
    && recovery.teardown?.verdict === 'pass' && recovery.teardown?.leakedStatePaths === 0
    && JSON.stringify(observed) === JSON.stringify(expected)
    && recovery.restorations.every(row => row.fullStateEquality === true && /^[a-f0-9]{64}$/.test(row.exportSha256 ?? ''));
}
