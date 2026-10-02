export const GIT_REPOSITORY_OVERRIDES: readonly string[] = [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_COMMON_DIR",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_PREFIX",
];

export function withoutGitRepositoryOverrides(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const kept = { ...env };
  forgetGitRepositoryOverrides(kept);
  return kept;
}

export function forgetGitRepositoryOverrides(env: NodeJS.ProcessEnv = process.env): void {
  for (const name of GIT_REPOSITORY_OVERRIDES) delete env[name];
}
