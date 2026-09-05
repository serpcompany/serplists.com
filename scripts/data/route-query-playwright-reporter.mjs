import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { recordRouteQueryUnitEvidence, routeEvidenceIdentity, routeFragmentDirectory } from './route-coverage-evidence.mjs';
import { ROUTE_QUERY_SNAPSHOT_PATH } from './build-instrumented-playwright-worker.mjs';

function handoffPath() { return join(dirname(routeFragmentDirectory()), 'route-query-pending-snapshot.json'); }

// Playwright global teardown precedes webServer plugin teardown. This is an
// unqualified handoff, not passing coverage; onEnd promotes it only on success.
export async function captureRouteQuerySnapshot() {
    if (process.env.PLAYWRIGHT_ROUTE_QUERY_EVIDENCE !== '1') return;
    const apiUrl = process.env.PLAYWRIGHT_API_URL;
    if (!apiUrl) throw new Error('PLAYWRIGHT_API_URL is required for route-query evidence');
    const snapshotUrl = new URL(ROUTE_QUERY_SNAPSHOT_PATH, apiUrl).toString();
    const response = await fetch(snapshotUrl, {signal:AbortSignal.timeout(10_000)});
    if (!response.ok) throw new Error(`Instrumented Worker snapshot failed with ${response.status}`);
    const snapshot = await response.json();
    if (!/^[a-f0-9]{64}$/.test(snapshot?.sourceDigest ?? '') || !Array.isArray(snapshot?.outcomes) || snapshot.outcomes.some(row => !/^(endpoint|query):[a-f0-9]{24}$/.test(row?.id ?? '') || !['success','error'].includes(row?.outcome))) throw new Error('Invalid instrumented Worker snapshot.');
    const safeSnapshot = {sourceDigest:snapshot.sourceDigest,outcomes:snapshot.outcomes.map(({id,outcome})=>({id,outcome}))};
    mkdirSync(dirname(handoffPath()), {recursive:true});
    writeFileSync(handoffPath(), JSON.stringify({identity:routeEvidenceIdentity(process.env),snapshot:safeSnapshot}));
}

export default class RouteQueryPlaywrightReporter {
  onBegin() { rmSync(handoffPath(), {force:true}); }
  async onEnd(result) {
    if (process.env.PLAYWRIGHT_ROUTE_QUERY_EVIDENCE !== '1') return;
    try {
      if (result.status !== 'passed') return;
      const handoff = JSON.parse(readFileSync(handoffPath(), 'utf8'));
      if (JSON.stringify(handoff.identity) !== JSON.stringify(routeEvidenceIdentity(process.env))) throw new Error('Mismatched instrumented Worker snapshot identity.');
      recordRouteQueryUnitEvidence(handoff.snapshot, process.env);
    } finally { rmSync(handoffPath(), {force:true}); }
  }
}
