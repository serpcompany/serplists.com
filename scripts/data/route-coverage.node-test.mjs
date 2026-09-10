import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateRouteInventory, summarizeRouteEvidence, coverageFingerprint, discoverRouteSurfaces, discoverRoutePatterns } from './route-coverage-lib.mjs';
import { finalizeRouteCoverage, recordRouteScenarios, recordRouteVisit, routeFragmentDirectory } from './route-coverage-evidence.mjs';
const surface = { path: 'functions/api/handlers/example.ts', kind: 'query-family', sha256: 'one' };
const inventory = { scenarios: ['real-query'], surfaces: [{ ...surface, scenarios: ['real-query'] }] };
test('new D1 surfaces fail and edits inside existing families require coverage review', () => {
  assert.deepEqual(validateRouteInventory([surface], inventory), []);
  assert.match(validateRouteInventory([surface, { ...surface, path: 'new.ts' }], inventory).join(), /Uncovered/);
  assert.match(validateRouteInventory([{ ...surface, sha256: 'two' }], inventory).join(), /Changed/);
});
test('source inventory cannot stand in for successful runtime scenarios', () => {
  assert.equal(summarizeRouteEvidence(inventory, [])[0].verdict, 'fail');
  assert.equal(summarizeRouteEvidence(inventory, ['real-query'])[0].verdict, 'pass');
  assert.equal(summarizeRouteEvidence(inventory, ['real-query', 'real-query'])[0].verdict, 'fail');
});
test('page copy edits do not invalidate coverage but new queries and route paths do', () => {
  const fingerprint = source => coverageFingerprint(source, 'src/pages/Example.tsx');
  assert.equal(fingerprint('export default () => <h1>Old</h1>'), fingerprint('export default () => <h1>New</h1>'));
  assert.notEqual(fingerprint('export default () => <h1>Old</h1>'), fingerprint('export default () => { api.list(); return <h1>Old</h1>; }'));
  assert.notEqual(fingerprint('<Route path="/old"/>'), fingerprint('<Route path="/new"/>'));
});

test('actual aggregate fails missing/stale evidence, new indirect server modules and new routes', () => {
  const root = mkdtempSync(join(tmpdir(), 'route-coverage-test-'));
  try {
    for (const dir of ['functions', 'src/pages', 'src/lib', 'scripts/data', 'tmp']) mkdirSync(join(root, dir), { recursive: true });
    writeFileSync(join(root, 'functions/helper.ts'), 'export const indirectHelper = () => 1;');
    writeFileSync(join(root, 'src/App.tsx'), '<Route path="/fixture" />');
    writeFileSync(join(root, 'src/lib/routes.ts'), 'export {};');
    const manifest = { scenarios: ['fixture'], surfaces: discoverRouteSurfaces(root).map(surface => ({ ...surface, scenarios: ['fixture'] })), routes: [{ pattern: '/fixture', example: '/fixture', persona: 'anonymous', scenario: 'fixture' }] };
    writeFileSync(join(root, 'scripts/data/route-coverage-inventory.json'), JSON.stringify(manifest));
    const env = { PLAYWRIGHT_ROUTE_COVERAGE_PROOF: join(root, 'tmp/route-coverage.json'), DATA_REGRESSION_START_COMMIT: 'a'.repeat(40), DATA_REGRESSION_MIGRATION_FROM: '0001_fixture.sql', DATA_REGRESSION_MIGRATION_TO: '0001_fixture.sql', PLAYWRIGHT_ROUTE_LEDGER_JSON: JSON.stringify([{ name: '0001_fixture.sql', sha256: 'b'.repeat(64) }]) };
    assert.throws(() => finalizeRouteCoverage(env, root), /coverage failed/);
    recordRouteScenarios(['fixture'], env);
    assert.throws(() => finalizeRouteCoverage(env, root), /coverage failed/);
    recordRouteVisit('/fixture', 'anonymous', env, root);
    assert.equal(finalizeRouteCoverage(env, root).verdict, 'pass');
    const noSelectedMigrations = { ...env, DATA_REGRESSION_MIGRATION_FROM: 'none', DATA_REGRESSION_MIGRATION_TO: 'none' };
    rmSync(routeFragmentDirectory(env), { recursive: true, force: true });
    recordRouteScenarios(['fixture'], noSelectedMigrations);
    recordRouteVisit('/fixture', 'anonymous', noSelectedMigrations, root);
    const noMigrationReport = finalizeRouteCoverage(noSelectedMigrations, root);
    assert.deepEqual(noMigrationReport.migrationRange, { from: null, to: null });
    assert.throws(() => finalizeRouteCoverage(env, root, { browserPassed: false }), /coverage failed/);
    assert.throws(() => finalizeRouteCoverage({ ...env, DATA_REGRESSION_START_COMMIT: 'c'.repeat(40) }, root), /coverage failed/);
    assert.throws(() => finalizeRouteCoverage({ ...env, PLAYWRIGHT_ROUTE_LEDGER_JSON: '[]' }, root), /coverage failed/);
    writeFileSync(join(root, 'functions/new-indirect-helper.js'), 'export const query = database => database.customQuery();');
    assert.match(validateRouteInventory(discoverRouteSurfaces(root), manifest).join(), /Uncovered surface/);
    writeFileSync(join(root, 'src/App.tsx'), '<><Route path="/fixture"/><Route path="/uncovered"/></>');
    assert.match(validateRouteInventory(discoverRouteSurfaces(root), manifest, discoverRoutePatterns(root)).join(), /Uncovered route pattern/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
