import { recordIntegrationScenario } from './data-regression-report-lib.mjs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { it } from 'vitest';

// Vitest is the mandatory aggregate entrypoint. Keep the route inventory and
// owned-resource failure controls inside it so they cannot become manual-only tests.
it('rejects uncovered routes and proves owned Worker teardown on failures', () => {
  execFileSync(process.execPath, ['--experimental-vm-modules', '--test',
    'scripts/data/route-coverage.node-test.mjs',
    'scripts/data/smoke-runner-ownership.node-test.mjs',
  ], {
    cwd: fileURLToPath(new URL('../..', import.meta.url)),
    env: {PATH:process.env.PATH,CI:'true',WRANGLER_SEND_METRICS:'false'},
    encoding:'utf8', stdio:['ignore','pipe','pipe'], timeout:90_000, maxBuffer:4*1024*1024,
  });
  recordIntegrationScenario('route-inventory-and-owned-teardown');
  }, 100_000);
