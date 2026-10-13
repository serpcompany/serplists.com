import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { checkNames, perFileChecks } from '../../../scripts/checks/checks';

const lefthookSchema = z.object({
  'pre-commit': z.object({ commands: z.record(z.object({ run: z.string(), glob: z.string().optional() }).passthrough()) }),
});

const preCommitCommands = Object.entries(
  lefthookSchema.parse(yaml.load(readFileSync('lefthook.yml', 'utf8')))['pre-commit'].commands,
);
const CHECKS_COMMAND = 'node --import tsx scripts/checks/cli.ts';

describe('the commit hooks', () => {
  it.each(preCommitCommands.filter(([, command]) => command.run.includes('{staged_files}')))(
    'start %s with node, so lefthook can batch a long list of staged files instead of overflowing cmd.exe through a package manager shim',
    (_name, command) => {
      expect(command.run).toMatch(/^node /);
      expect(command.run).not.toMatch(/^(pnpm|npx|yarn)\b/);
    },
  );

  it('run the per-file checks of the checks command on every staged file, whatever its format', () => {
    const verify = preCommitCommands.find(([, command]) => command.run.startsWith(CHECKS_COMMAND))?.[1];
    expect(verify?.run).toBe(`${CHECKS_COMMAND} ${perFileChecks.join(',')} {staged_files}`);
    expect(verify?.glob).toBeUndefined();
    expect(perFileChecks.every((check) => checkNames.includes(check))).toBe(true);
  });
});
