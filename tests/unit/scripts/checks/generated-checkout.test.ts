import { describe, expect, it } from 'vitest';

import { runChecks, selectRun } from '../../../../scripts/checks/checks';
import { CLOUDFLARE_TYPES, generatorChecks, staleGeneratedFiles } from '../../../../scripts/checks/generated';
import { generatedRule } from '../../../../scripts/checks/rules';
import { stringMatching } from '../../../support/asymmetricMatchers';
import { scratchRepository } from './scratch';

const WRANGLER_TOML = ['name = "scratch-worker"', 'main = ".open-next/worker.js"', 'compatibility_date = "2025-01-01"', '', '[vars]', 'SITE_URL = "http://localhost:3000"', ''].join('\n');

const generatorScript = (check: string) => `scripts/${check.replace(/:/g, '-')}.ts`;

function scratchCheckout(generatorExitCode: (check: string) => number, wranglerToml = WRANGLER_TOML) {
  const scripts = Object.fromEntries(generatorChecks.map(({ check }) => [check, `node --import tsx ${generatorScript(check)} --check`]));
  return scratchRepository('generated-checkout', {
    'package.json': JSON.stringify({ scripts }),
    ...Object.fromEntries(
      generatorChecks.map(({ check }) => [generatorScript(check), `console.log('${check} ran');\nprocess.exit(${generatorExitCode(check)});\n`]),
    ),
    'wrangler.toml': wranglerToml,
    '.dev.vars.example': 'BETTER_AUTH_SECRET=\nAPI_KEY=your-key-here\n',
    [CLOUDFLARE_TYPES]: 'interface CloudflareEnv {}\n',
  });
}

describe('the generated files check on a checkout', { timeout: 120_000 }, () => {
  it('names each stale generator and the Worker types that differ from what wrangler types writes, then the rule', async () => {
    const at = scratchCheckout((check) => (check === 'templates:check' ? 1 : 0));

    expect(await runChecks(['generated'], selectRun([], at))).toEqual([
      {
        name: 'generated',
        passed: false,
        report: [
          'pnpm run templates:check failed: run pnpm run templates:generate and commit what it writes.\ntemplates:check ran',
          stringMatching(/^cloudflare-env\.d\.ts:\d+ {2}differs from what wrangler types writes/),
          generatedRule,
        ],
      },
    ]);
  });

  it('stops with what wrangler said when it cannot write the types', () => {
    const at = scratchCheckout(() => 0, 'name = "unclosed\n');

    expect(() => staleGeneratedFiles(at)).toThrow(/^wrangler types failed \(exit 1\): /);
  });
});
