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
