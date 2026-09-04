import { describe, expect, it } from "vitest";

import { assertWorkflowRequestContext } from "./workflow-request-context-lib.mjs";

const gitCommit = "0123456789abcdef0123456789abcdef01234567";
const valid = {
  GITHUB_ACTIONS: "true",
  GITHUB_REPOSITORY: "serpcompany/serplists.com",
  GITHUB_REF_PROTECTED: "true",
  GITHUB_EVENT_NAME: "workflow_dispatch",
  GITHUB_RUN_ID: "123456789",
  GITHUB_SHA: gitCommit,
  DATA_PROMOTION_WORKFLOW: "data-promotion",
  DATA_PROTECTED_ENVIRONMENT: "staging",
  DATA_APPROVER_IDENTITY: "@devinschumacher",
};

describe("workflow request metadata", () => {
  it("fails closed outside the exact workflow request context", () => {
    for (const environment of [
      {},
      { ...valid, GITHUB_REF_PROTECTED: "false" },
      { ...valid, GITHUB_EVENT_NAME: "push" },
      { ...valid, GITHUB_SHA: "f".repeat(40) },
      { ...valid, DATA_PROMOTION_WORKFLOW: "arbitrary-job" },
    ]) {
      expect(() =>
        assertWorkflowRequestContext({
          env: environment,
          gitCommit,
          targetEnvironment: "rehearsal",
          requestedApproverIdentity: "@devinschumacher",
        }),
      ).toThrow(/workflow request context/i);
    }
  });

  it("records allowlisted but unverified request metadata for staging/rehearsal", () => {
    expect(
      assertWorkflowRequestContext({
        env: valid,
        gitCommit,
        targetEnvironment: "rehearsal",
        requestedApproverIdentity: "@devinschumacher",
      }),
    ).toMatchObject({
      repository: "serpcompany/serplists.com",
      runId: "123456789",
      requestedApproverIdentity: "@devinschumacher",
      protectedEnvironment: "staging",
      verification: "unverified-request-metadata",
    });
  });

  it("never treats environment metadata as production authorization", () => {
    expect(() =>
      assertWorkflowRequestContext({
        env: valid,
        gitCommit,
        targetEnvironment: "production",
        requestedApproverIdentity: "@devinschumacher",
      }),
    ).toThrow(/cannot authorize production/i);

    expect(() =>
      assertWorkflowRequestContext({
        env: { ...valid, DATA_PROTECTED_ENVIRONMENT: "production" },
        gitCommit,
        targetEnvironment: "production",
        requestedApproverIdentity: "@devinschumacher",
      }),
    ).toThrow(/cannot authorize production/i);
  });
});
