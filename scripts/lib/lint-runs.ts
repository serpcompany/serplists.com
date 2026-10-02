import { TYPE_CHECKED_AREAS } from "../../eslint.type-aware.config";

export const TYPE_AWARE_CONFIG = "eslint.type-aware.config.ts";

export function lintRuns(extraArgs: readonly string[] = []): string[][] {
  const areaRuns = TYPE_CHECKED_AREAS.map(({ folders }) => [...folders]);
  const everyAreaLeftOut = TYPE_CHECKED_AREAS.flatMap(({ folders }) =>
    folders.flatMap((folder) => ["--ignore-pattern", `${folder}/**`]),
  );
  return [...areaRuns, [".", ...everyAreaLeftOut]].map((paths) => ["--config", TYPE_AWARE_CONFIG, ...extraArgs, ...paths]);
}
