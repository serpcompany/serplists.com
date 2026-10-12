import { outputLines, packageBin, quietEnvironment, runNode } from "./tools";

export const knipArguments: readonly string[] = ["--no-progress"];

export function findDeadCode(at: string): string[] {
  const ran = runNode(packageBin("knip", "knip"), knipArguments, { cwd: at, env: quietEnvironment() });
  if (ran.status === 0) return [];
  if (ran.status !== 1) throw new Error(`knip could not finish (exit ${ran.status}): ${ran.output}`);
  return outputLines(ran.output);
}
