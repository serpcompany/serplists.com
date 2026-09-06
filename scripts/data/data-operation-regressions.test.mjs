import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

// Node-native operation contracts also belong to the mandatory Vitest gate.
// Exit zero alone is insufficient when Node tests can be skipped.
it.each([
  ['staging range producer/consumer', 'staging-reviewed-range-producer-consumer.node-test.mjs', 8],
  ['rehearsal creation preflight', 'rehearsal-create-preflight.node-test.mjs', 43],
])('executes every %s regression', (_label, file, expectedCount) => {
  const output = execFileSync(process.execPath, ['--test', '--test-reporter=tap', `scripts/data/${file}`], {
    cwd: fileURLToPath(new URL('../..', import.meta.url)),
    env: { PATH: process.env.PATH, CI: 'true' },
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000,
  });
  const count = name => {
    const values = [...output.matchAll(new RegExp(`^# ${name} (\\d+)$`, 'gm'))];
    expect(values, `Missing or duplicate ${name} total`).toHaveLength(1);
    return Number(values[0][1]);
  };
  expect(count('tests')).toBe(expectedCount);
  expect(count('pass')).toBe(expectedCount);
  for (const name of ['fail', 'cancelled', 'skipped', 'todo']) expect(count(name)).toBe(0);
}, 35000);
