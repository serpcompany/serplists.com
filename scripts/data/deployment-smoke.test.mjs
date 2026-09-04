import { describe, expect, it } from "vitest";
import { evaluateDeploymentSmoke, exerciseControlledCanaryMutation, validateControlledCanaryChecks } from "./deployment-smoke-lib.mjs";

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
  designatedTemplateId: "template-1",
  designatedRunId: "run-1",
  controlledCanaryMutationApproved: true,
  canaryEvidenceDigest: "a".repeat(64),
  canaryMutation: {
    template: { id: "template-1", originalTitle: "Canary", originalVersion: 3, probeTitle: "Canary [write probe]", writeStatus: 200, readbackTitle: "Canary [write probe]", readbackVersion: 4, restoreStatus: 200, restoredTitle: "Canary" },
    run: { id: "run-1", originalProgress: 10, originalRevision: 2, probeProgress: 42, writeStatus: 200, readbackProgress: 42, readbackRevision: 3, restoreStatus: 200, restoredProgress: 10 },
  },
};

describe("postdeploy authenticated data smoke", () => {
  it("passes only when account-owned templates/runs and both domains are visible", () => {
    const report = evaluateDeploymentSmoke(passing);
    expect(report.verdict).toBe("pass");
    expect(report).not.toHaveProperty("canaryMutation");
    expect(validateControlledCanaryChecks(report)).toEqual(report);
  });

  it.each([
    ["empty templates", { templateRows: [] }],
    ["empty runs", { runRows: [] }],
    ["no database canary rows", { databaseTemplateIds: [], databaseRunIds: [] }],
    ["auth error", { templateStatus: 401 }],
    ["deployment unhealthy", { deploymentHealthStatus: 500 }],
    ["custom domain unhealthy", { customDomainHealthStatus: 500 }],
    ["template restore mismatch", { canaryMutation: { ...passing.canaryMutation, template: { ...passing.canaryMutation.template, restoredTitle: "probe leaked" } } }],
    ["run readback mismatch", { canaryMutation: { ...passing.canaryMutation, run: { ...passing.canaryMutation.run, readbackProgress: 99 } } }],
    ["mutation not approved", { controlledCanaryMutationApproved: false }],
  ])("fails closed for %s", (_name, override) => {
    expect(evaluateDeploymentSmoke({ ...passing, ...override }).verdict).toBe("fail");
  });

  it("rejects missing, failed, or extra canary mutation claims", () => {
    const report = evaluateDeploymentSmoke(passing);
    for (const checks of [report.checks.slice(1), report.checks.map((check, index) => index === 0 ? { ...check, verdict: "fail" } : check), [...report.checks, { name: "invented", verdict: "pass" }]]) expect(() => validateControlledCanaryChecks({ ...report, checks })).toThrow();
    expect(() => validateControlledCanaryChecks({ ...report, canaryEvidenceDigest: null })).toThrow();
    expect(() => validateControlledCanaryChecks({ ...report, canaryMutation: passing.canaryMutation })).toThrow(/privacy-unsafe/i);
  });

  it("updates, reads back, and restores only the designated canary records", async () => {
    const state = { template: { id: "template-1", title: "Original", version: 3 }, run: { id: "run-1", progress: 10, revision: 2 } };
    const request = async (path, init = {}) => {
      const record = path.includes("templates") ? state.template : state.run;
      if (init.method === "PUT") {
        const body = JSON.parse(init.body);
        if (record === state.template) { record.title = body.title; record.version += 1; }
        else { record.progress = body.progress; record.revision += 1; }
      }
      return { status: 200, rows: { ...record } };
    };
    const evidence = await exerciseControlledCanaryMutation({ template: { ...state.template }, run: { ...state.run }, request });
    expect(state).toEqual({ template: { id: "template-1", title: "Original", version: 5 }, run: { id: "run-1", progress: 10, revision: 4 } });
    expect(evaluateDeploymentSmoke({ ...passing, canaryMutation: evidence }).verdict).toBe("pass");
  });

  it("attempts restoration after a post-write readback failure", async () => {
    const state = { title: "Original", version: 3 };
    let templateGets = 0;
    const request = async (path, init = {}) => {
      if (path.includes("templates")) {
        if (init.method === "PUT") { const body = JSON.parse(init.body); state.title = body.title; state.version += 1; return { status: 200, rows: {} }; }
        templateGets += 1;
        if (templateGets === 1) throw new Error("readback failed");
        return { status: 200, rows: { ...state } };
      }
      return { status: 500, rows: {} };
    };
    const evidence = await exerciseControlledCanaryMutation({ template: { id: "template-1", title: "Original", version: 3 }, run: { id: "run-1", progress: 10, revision: 2 }, request });
    expect(evidence.error).toMatch(/readback failed/);
    expect(state.title).toBe("Original");
  });

  it("restores a write that commits before the network response throws", async () => {
    const state = { id: "template-1", title: "Original", version: 3 };
    let firstPut = true;
    const request = async (requestPath, init = {}) => {
      if (requestPath.includes("templates")) {
        if (init.method === "PUT") {
          const body = JSON.parse(init.body);
          state.title = body.title;
          state.version += 1;
          if (firstPut) { firstPut = false; throw new Error("response lost after commit"); }
        }
        return { status: 200, rows: { ...state } };
      }
      return { status: 500, rows: {} };
    };
    const evidence = await exerciseControlledCanaryMutation({ template: { ...state }, run: { id: "run-1", progress: 10, revision: 2 }, request });
    expect(evidence.error).toMatch(/response lost after commit/);
    expect(state.title).toBe("Original");
    expect(evidence.template.restoredTitle).toBe("Original");
  });

  it("does not overwrite an intervening template update", async () => {
    const state = { id: "template-1", title: "Original", version: 3 };
    let templateGets = 0;
    const request = async (requestPath, init = {}) => {
      if (requestPath.includes("templates")) {
        if (init.method === "PUT") { const body = JSON.parse(init.body); state.title = body.title; state.version += 1; return { status: 200, rows: { ...state } }; }
        templateGets += 1;
        if (templateGets === 2) { state.title = "Legitimate concurrent title"; state.version += 1; }
        return { status: 200, rows: { ...state } };
      }
      return { status: 500, rows: {} };
    };
    const evidence = await exerciseControlledCanaryMutation({ template: { ...state }, run: { id: "run-1", progress: 10, revision: 2 }, request });
    expect(state.title).toBe("Legitimate concurrent title");
    expect(evidence.template.restoreError).toMatch(/concurrently/i);
  });

  it("does not overwrite an intervening run update", async () => {
    const state = { template: { id: "template-1", title: "Original", version: 3 }, run: { id: "run-1", progress: 10, revision: 2 } };
    let runGets = 0;
    const request = async (requestPath, init = {}) => {
      const record = requestPath.includes("templates") ? state.template : state.run;
      if (init.method === "PUT") {
        const body = JSON.parse(init.body);
        if (record === state.template) { record.title = body.title; record.version += 1; }
        else { record.progress = body.progress; record.revision += 1; }
        return { status: 200, rows: { ...record } };
      }
      if (record === state.run) {
        runGets += 1;
        if (runGets === 2) { record.progress = 77; record.revision += 1; }
      }
      return { status: 200, rows: { ...record } };
    };
    const evidence = await exerciseControlledCanaryMutation({ template: { ...state.template }, run: { ...state.run }, request });
    expect(state.run.progress).toBe(77);
    expect(evidence.run.restoreError).toMatch(/concurrently/i);
  });

  it("emits only privacy-safe canary checks and a keyed digest", () => {
    const serialized = JSON.stringify(evaluateDeploymentSmoke(passing));
    for (const sentinel of ["template-1", "run-1", "Canary [write probe]", "\"originalTitle\"", "\"originalProgress\""]) expect(serialized).not.toContain(sentinel);
  });
});
