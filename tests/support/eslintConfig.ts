import { ESLint, type Linter } from 'eslint';
import { z } from 'zod';

import repositoryConfig from '../../eslint.config';
import typeAwareConfig from '../../eslint.type-aware.config';

const calculatedConfig = z.object({ rules: z.record(z.unknown()).optional() }).passthrough().optional();

const ruleSetting = z.tuple([z.number()]).rest(z.unknown());

const CONFIG_FILES: Record<'eslint.config.ts' | 'eslint.type-aware.config.ts', unknown> = {
  'eslint.config.ts': repositoryConfig,
  'eslint.type-aware.config.ts': typeAwareConfig,
};

export type ConfigFile = keyof typeof CONFIG_FILES;

const isFlatConfigList = (value: unknown): value is Linter.Config[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'object' && entry !== null);

export function repositoryESLint({ cwd = process.cwd(), configFile = 'eslint.config.ts' }: { cwd?: string; configFile?: ConfigFile } = {}): ESLint {
  const config = CONFIG_FILES[configFile];
  if (!isFlatConfigList(config)) throw new Error(`${configFile} must export a list of flat configs`);
  return new ESLint({ cwd, overrideConfigFile: true, overrideConfig: config });
}

export async function rulesFor(eslint: ESLint, file: string): Promise<Record<string, unknown>> {
  return calculatedConfig.parse(await eslint.calculateConfigForFile(file))?.rules ?? {};
}

export const isError = (setting: unknown): boolean => ruleSetting.safeParse(setting).data?.[0] === 2;
