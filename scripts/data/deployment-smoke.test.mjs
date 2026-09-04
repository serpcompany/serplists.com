import { describe, expect, it } from "vitest";
import { evaluateDeploymentSmoke } from "./deployment-smoke-lib.mjs";

const passing = {
  databaseTemplateIds: ["template-1"],
  databaseRunIds: ["run-1"],
  templateStatus: 200,
  templateRows: [{ id: "template-1", user_id: "canary" }],
  runStatus: 200,
  runRows: [{ id: "run-1", user_id: "canary" }],
  ownerId: "canary",
  deploymentHealthStatus: 200,
  customDomainHealthStatus: 200,
};

describe("postdeploy authenticated data smoke", () => {
  it("passes only when account-owned templates/runs and both domains are visible", () => {
    expect(evaluateDeploymentSmoke(passing).verdict).toBe("pass");
  });

  it.each([
    ["empty templates", { templateRows: [] }],
    ["empty runs", { runRows: [] }],
    ["no database canary rows", { databaseTemplateIds: [], databaseRunIds: [] }],
    ["auth error", { templateStatus: 401 }],
    ["deployment unhealthy", { deploymentHealthStatus: 500 }],
    ["custom domain unhealthy", { customDomainHealthStatus: 500 }],
  ])("fails closed for %s", (_name, override) => {
    expect(evaluateDeploymentSmoke({ ...passing, ...override }).verdict).toBe("fail");
  });
});
