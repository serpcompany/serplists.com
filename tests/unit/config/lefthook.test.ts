import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

const lefthookSchema = z.object({
  'pre-commit': z.object({ commands: z.record(z.object({ run: z.string() }).passthrough()) }),
});

const preCommitCommands = Object.entries(
  lefthookSchema.parse(yaml.load(readFileSync('lefthook.yml', 'utf8')))['pre-commit'].commands,
);

describe('the commit hooks', () => {
  it.each(preCommitCommands.filter(([, command]) => command.run.includes('{staged_files}')))(
    'start %s with node, so lefthook can batch a long list of staged files instead of overflowing cmd.exe through a package manager shim',
    (_name, command) => {
      expect(command.run).toMatch(/^node /);
      expect(command.run).not.toMatch(/^(pnpm|npx|yarn)\b/);
    },
  );
});
