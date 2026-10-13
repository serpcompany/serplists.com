import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

import { root } from "./files";

const binEntries = z
  .object({ bin: z.union([z.string(), z.record(z.string())]) })
  .transform(({ bin }) => (typeof bin === "string" ? { single: bin } : { named: bin }));
const spawnFailure = z.object({ code: z.string() });

export function binOfPackageHolding(file: string, command: string): string {
  for (let folder = path.dirname(file); folder !== path.dirname(folder); folder = path.dirname(folder)) {
    const manifest = path.join(folder, "package.json");
    const entries = existsSync(manifest) ? binEntries.safeParse(JSON.parse(readFileSync(manifest, "utf8"))).data : undefined;
    const script = entries && ("single" in entries ? entries.single : entries.named[command]);
    if (script !== undefined) return path.join(folder, script);
  }
  throw new Error(`No package above ${file} has a ${command} command in its package.json bin.`);
}

export const packageBin = (packageName: string, command: string) =>
  binOfPackageHolding(path.join(root, "node_modules", ...packageName.split("/"), "package.json"), command);

export interface Ran {
  status: number | null;
  output: string;
  missing: boolean;
}

export interface RunOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
}

export function run(command: string, args: readonly string[], { cwd, env = process.env }: RunOptions): Ran {
  const result = spawnSync(command, args, { cwd, env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return {
    status: result.status,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim(),
    missing: spawnFailure.safeParse(result.error).data?.code === "ENOENT",
  };
}

export const runNode = (script: string, args: readonly string[], options: RunOptions) =>
  run(process.execPath, [script, ...args], options);

export const quietEnvironment = (): NodeJS.ProcessEnv => ({ ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" });

export const outputLines = (output: string) =>
  output
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);
