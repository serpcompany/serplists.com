const REQUIRED_CONTEXT = {
  GITHUB_ACTIONS: "true",
  GITHUB_REPOSITORY: "serpcompany/serplists.com",
  GITHUB_REF_PROTECTED: "true",
  GITHUB_EVENT_NAME: "workflow_dispatch",
  DATA_PROMOTION_WORKFLOW: "data-promotion",
};

export function assertWorkflowRequestContext({
  env,
  gitCommit,
  targetEnvironment,
  requestedApproverIdentity,
}) {
  if (targetEnvironment === "production") {
    throw new Error(
      "Unverified workflow request metadata cannot authorize production; issue #97 must enforce a non-forgeable boundary.",
    );
  }
  for (const [name, expected] of Object.entries(REQUIRED_CONTEXT)) {
    if (env?.[name] !== expected) {
      throw new Error(`Workflow request context requires ${name}=${expected}.`);
    }
  }
  if (!/^\d+$/.test(env.GITHUB_RUN_ID ?? "")) {
    throw new Error("Workflow request context requires a numeric GITHUB_RUN_ID.");
  }
  if (env.GITHUB_SHA !== gitCommit) {
    throw new Error("Workflow request context must name the exact reported Git commit.");
  }
  if (env.DATA_APPROVER_IDENTITY !== requestedApproverIdentity) {
    throw new Error("Workflow request context approver does not match the requested manifest identity.");
  }
  if (env.DATA_PROTECTED_ENVIRONMENT !== "staging") {
    throw new Error("Workflow request context requires the staging environment label.");
  }
  return {
    repository: env.GITHUB_REPOSITORY,
    runId: env.GITHUB_RUN_ID,
    commit: env.GITHUB_SHA,
    requestedApproverIdentity,
    protectedEnvironment: env.DATA_PROTECTED_ENVIRONMENT,
    verification: "unverified-request-metadata",
  };
}

export function assertSanitizerSourceWorkflowContext({ env, gitCommit }) {
  for (const [name, expected] of Object.entries(REQUIRED_CONTEXT)) {
    if (env?.[name] !== expected) {
      throw new Error(`Sanitizer source workflow context requires ${name}=${expected}.`);
    }
  }
  if (env.GITHUB_REF !== "refs/heads/main" || env.DATA_PROTECTED_ENVIRONMENT !== "production") {
    throw new Error("Sanitizer source export requires the protected production environment on main.");
  }
  if (env.GITHUB_SHA !== gitCommit || !/^\d+$/.test(env.GITHUB_RUN_ID ?? "")) {
    throw new Error("Sanitizer source workflow must name the exact GitHub run and commit.");
  }
  if (!env.CLOUDFLARE_API_TOKEN) {
    throw new Error("Sanitizer source workflow requires the protected production D1 token.");
  }
  return {
    repository: env.GITHUB_REPOSITORY,
    runId: env.GITHUB_RUN_ID,
    commit: env.GITHUB_SHA,
    protectedEnvironment: env.DATA_PROTECTED_ENVIRONMENT,
  };
}

export function assertStagingMutationWorkflowContext({ env, gitCommit }) {
  const required = {
    GITHUB_ACTIONS: "true",
    GITHUB_REPOSITORY: "serpcompany/serplists.com",
    GITHUB_REF_PROTECTED: "true",
    GITHUB_EVENT_NAME: "push",
    GITHUB_REF: "refs/heads/staging",
    DATA_PROMOTION_WORKFLOW: "data-promotion",
    DATA_PROTECTED_ENVIRONMENT: "staging",
  };
  for (const [name, expected] of Object.entries(required)) {
    if (env?.[name] !== expected) throw new Error(`Staging mutation workflow context requires ${name}=${expected}.`);
  }
  if (env.GITHUB_SHA !== gitCommit || !/^\d+$/.test(env.GITHUB_RUN_ID ?? "")) {
    throw new Error("Staging mutation workflow must name the exact GitHub run and commit.");
  }
  return { repository: env.GITHUB_REPOSITORY, runId: env.GITHUB_RUN_ID, commit: env.GITHUB_SHA };
}
