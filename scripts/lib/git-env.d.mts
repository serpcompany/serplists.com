export const GIT_REPOSITORY_OVERRIDES: readonly string[];
export function withoutGitRepositoryOverrides(env?: NodeJS.ProcessEnv): NodeJS.ProcessEnv;
export function forgetGitRepositoryOverrides(env?: NodeJS.ProcessEnv): void;
