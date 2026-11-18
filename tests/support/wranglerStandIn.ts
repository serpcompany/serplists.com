import { buildToolInvocation } from '../../scripts/lib/run-tool';
import { firstOf } from './elements';

export type WranglerAnswer = { when: string; answer: unknown };

const ANSWER_VARIABLE = 'SERPLISTS_WRANGLER_STAND_IN_ANSWER';

export const wranglerAnswering = (answer: WranglerAnswer): Record<string, string> => ({ [ANSWER_VARIABLE]: JSON.stringify(answer) });

const forwardingWrangler = (realWrangler: string): string => `const { spawnSync } = require('node:child_process');
const args = process.argv.slice(2);
const command = args.includes('--command') ? args[args.indexOf('--command') + 1] : '';
const standIn = JSON.parse(process.env[${JSON.stringify(ANSWER_VARIABLE)}] || 'null');
if (standIn && args.includes('--json') && command.includes(standIn.when)) {
  process.stdout.write(JSON.stringify(standIn.answer));
} else {
  process.exitCode = spawnSync(process.execPath, [${JSON.stringify(realWrangler)}, ...args], { stdio: 'inherit' }).status ?? 1;
}
`;

export const aWranglerThatCanAnswerForItself = () => ({
  wrangler: {
    'package.json': JSON.stringify({ name: 'wrangler', version: '0.0.0-stand-in', bin: { wrangler: 'cli.js' } }),
    'cli.js': forwardingWrangler(firstOf(buildToolInvocation('wrangler').args)),
  },
});
