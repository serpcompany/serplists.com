import type { OutputType } from "dependency-cruiser";

import { outputLines, packageBin, quietEnvironment, runNode } from "./tools";

export const cruisedPaths: readonly string[] = ["src", "functions", "db", "next.config.ts"];
export const dependencyConfig = ".dependency-cruiser.cjs";
const REPORTER_THAT_PRINTS_EACH_RULES_COMMENT: OutputType = "err-long";

const overlaps = (cruised: string, requested: string) =>
  cruised === requested || cruised.startsWith(`${requested}/`) || requested.startsWith(`${cruised}/`);

export function cruise(at: string, config: string, paths: readonly string[]): string[] {
  const reporter = ["-T", REPORTER_THAT_PRINTS_EACH_RULES_COMMENT];
  const ran = runNode(packageBin("dependency-cruiser", "depcruise"), ["--config", config, ...reporter, ...paths], {
    cwd: at,
    env: quietEnvironment(),
  });
  return ran.status === 0 ? [] : outputLines(ran.output);
}

export function checkDependencies(at: string, prefixes: readonly string[]): string[] {
  const touched = prefixes.length === 0 || prefixes.some((prefix) => cruisedPaths.some((cruised) => overlaps(cruised, prefix)));
  return touched ? cruise(at, dependencyConfig, cruisedPaths) : [];
}
