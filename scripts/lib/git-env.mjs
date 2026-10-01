export const GIT_REPOSITORY_OVERRIDES = [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_COMMON_DIR",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_PREFIX",
];

export function withoutGitRepositoryOverrides(env = process.env) {
  return Object.fromEntries(Object.entries(env).filter(([name]) => !GIT_REPOSITORY_OVERRIDES.includes(name)));
}

export function forgetGitRepositoryOverrides(env = process.env) {
  for (const name of GIT_REPOSITORY_OVERRIDES) delete env[name];
}
