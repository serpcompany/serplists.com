import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { writeDataCheckReports } from './reporting.mjs';
import { discoverRoutePatterns, discoverRouteSurfaces, validateRouteInventory, summarizeRouteEvidence } from './route-coverage-lib.mjs';
import { normalizeMigrationRange } from './migration-range-lib.mjs';

export function assertRouteInventory(root) {
  const inventory = JSON.parse(readFileSync(join(root, 'scripts/data/route-coverage-inventory.json'), 'utf8'));
  const errors = validateRouteInventory(discoverRouteSurfaces(root), inventory, discoverRoutePatterns(root));
  if (errors.length) throw new Error(errors.join('\n'));
}

export function routeFragmentDirectory(env = process.env) {
  return join(dirname(env.PLAYWRIGHT_ROUTE_COVERAGE_PROOF ?? 'tmp/data-reports/route-coverage.json'), 'route-coverage-fragments');
}

function binding(env) {
  return {
    commit: env.DATA_REGRESSION_START_COMMIT,
    migrationRange: normalizeMigrationRange({
      from: env.DATA_REGRESSION_MIGRATION_FROM,
      to: env.DATA_REGRESSION_MIGRATION_TO,
    }),
    migrationLedger: JSON.parse(env.PLAYWRIGHT_ROUTE_LEDGER_JSON ?? '[]'),
  };
}
export { binding as routeEvidenceIdentity };

function pathHash(path) { return createHash('sha256').update(path).digest('hex'); }
function matchesRoute(pattern, path) {
  if (pattern === '*') return false;
  const expression = pattern.split('/').map(part => part.startsWith(':') ? '[^/]+' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('/');
  return new RegExp(`^${expression}$`).test(path);
}

export function recordRouteVisit(path, persona, env = process.env, root = process.cwd()) {
  const inventory = JSON.parse(readFileSync(join(root, 'scripts/data/route-coverage-inventory.json'), 'utf8'));
  const candidates = inventory.routes.filter(route => matchesRoute(route.pattern, path)).sort((a, b) => Number(a.pattern.includes(':')) - Number(b.pattern.includes(':')));
  if (!candidates.length) throw new Error(`Visited route is absent from inventory: ${path}`);
  const directory = routeFragmentDirectory(env);
  mkdirSync(directory, { recursive: true });
  const visit = { pattern: candidates[0].pattern, persona, exampleSha256: pathHash(path) };
  writeFileSync(join(directory, `visit-${pathHash(`${persona}:${path}`)}.json`), JSON.stringify({ ...binding(env), verdict: 'pass', visit }, null, 2));
}

// Called only after the scenario's actual assertions succeed. The smoke runner
// clears this directory before replay, and validates all required fragments
// after all browser/Worker suites have completed.
export function recordRouteScenarios(names, env = process.env, details = {}) {
  if (!names.length || names.some(name => !/^[a-z0-9-]+$/.test(name))) throw new Error('Invalid route scenario name');
  const directory = routeFragmentDirectory(env);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, `${names[0]}-${randomUUID()}.json`), JSON.stringify({ ...binding(env), verdict: 'pass', scenarios: names, details }, null, 2));
}

export function finalizeRouteCoverage(env = process.env, root = process.cwd(), { browserPassed = true } = {}) {
  const inventory = JSON.parse(readFileSync(join(root, 'scripts/data/route-coverage-inventory.json'), 'utf8'));
  const errors = validateRouteInventory(discoverRouteSurfaces(root), inventory, discoverRoutePatterns(root));
  const identity = binding(env);
  const rangeIsPaired = (identity.migrationRange.from === null) === (identity.migrationRange.to === null);
  if (!/^[a-f0-9]{40}$/.test(identity.commit ?? '') || !rangeIsPaired || !identity.migrationLedger.length || identity.migrationLedger.some(row => !row.name || !/^[a-f0-9]{64}$/.test(row.sha256))) errors.push('Missing exact commit, paired selected migration range, or real applied migration ledger binding');
  if (!browserPassed) errors.push('Real browser suite failed');
  mkdirSync(routeFragmentDirectory(env), { recursive: true });
  const observed = [];
  const scenarioEvidence = [];
  const visitedRoutes = [];
  for (const filename of readdirSync(routeFragmentDirectory(env))) {
    const fragment = JSON.parse(readFileSync(join(routeFragmentDirectory(env), filename), 'utf8'));
    if (fragment.verdict !== 'pass' || JSON.stringify({ commit: fragment.commit, migrationRange: fragment.migrationRange, migrationLedger: fragment.migrationLedger }) !== JSON.stringify(binding(env))) errors.push(`Mismatched scenario evidence: ${filename}`);
    else if (fragment.visit) visitedRoutes.push(fragment.visit);
    else { observed.push(...fragment.scenarios); scenarioEvidence.push(fragment); }
  }
  for (const route of inventory.routes ?? []) {
    if (route.notApplicable) continue;
    if (!visitedRoutes.some(visit => visit.pattern === route.pattern && visit.persona === route.persona && (route.example.includes(':') || visit.exampleSha256 === pathHash(route.example)))) errors.push(`Route was not successfully visited: ${route.pattern} (${route.persona})`);
  }
  const checks = [...summarizeRouteEvidence(inventory, observed), ...errors.map(name => ({ name, verdict: 'fail' }))];
  const report = { ...binding(env), verdict: checks.every(check => check.verdict === 'pass') ? 'pass' : 'fail', target: { environment: 'local', binding: 'DB', databaseName: 'serp-checklists-db', databaseId: 'local:miniflare:DB@isolated-data-regression', synthetic: true }, checks, routes: inventory.routes, visitedRoutes, surfaces: inventory.surfaces, scenarioEvidence, branchCoverage: inventory.branchCoverage };
  writeDataCheckReports({ name: 'route-coverage', report, summary: `Real Worker / local D1 route coverage\n${checks.map(check => `${check.verdict}: ${check.name}`).join('\n')}\n${inventory.branchCoverage}`, reportDirectory: dirname(env.PLAYWRIGHT_ROUTE_COVERAGE_PROOF ?? 'tmp/data-reports/route-coverage.json') });
  if (report.verdict !== 'pass') throw new Error('Required real D1 scenario coverage failed; see route-coverage.json');
  return report;
}
