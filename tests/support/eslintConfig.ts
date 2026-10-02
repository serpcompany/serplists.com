import type { ESLint } from 'eslint';
import { z } from 'zod';

const calculatedConfig = z.object({ rules: z.record(z.unknown()).optional() }).passthrough().optional();

const ruleSetting = z.tuple([z.number()]).rest(z.unknown());

export async function rulesFor(eslint: ESLint, file: string): Promise<Record<string, unknown>> {
  return calculatedConfig.parse(await eslint.calculateConfigForFile(file))?.rules ?? {};
}

export const isError = (setting: unknown): boolean => ruleSetting.safeParse(setting).data?.[0] === 2;
