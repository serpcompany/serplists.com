import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { it } from 'vitest';

// Vitest is the mandatory aggregate entrypoint. Keep the Node-native AST and
// real Worker parity controls inside it so they cannot become manual-only tests.
it('executes query-unit discovery negative controls and real Worker D1 instrumentation parity', () => {
  execFileSync(process.execPath, ['--test',
    'scripts/data/route-query-units.node-test.mjs',
    'scripts/data/route-coverage.node-test.mjs',
    'scripts/data/route-query-units-real-d1.node-test.mjs',
    'scripts/data/playwright-route-query-integration.node-test.mjs',
  ], {
    cwd: fileURLToPath(new URL('../..', import.meta.url)),
    env: {PATH:process.env.PATH,CI:'true',WRANGLER_SEND_METRICS:'false'},
    encoding:'utf8', stdio:['ignore','pipe','pipe'], timeout:90_000, maxBuffer:4*1024*1024,
  });
}, 100_000);
