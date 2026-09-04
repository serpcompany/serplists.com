import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import yaml from "js-yaml";
import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const workflowPath = path.join(
  repositoryRoot,
  ".github/workflows/cloudflare-pages-deploy.yml",
);
const source = fs.readFileSync(workflowPath, "utf8");
const workflow = yaml.load(source);
const jobs = workflow.jobs ?? {};
const rehearsalWorkflowPath = path.join(
  repositoryRoot,
  ".github/workflows/data-migration-rehearsal.yml",
);
const rehearsalSource = fs.readFileSync(rehearsalWorkflowPath, "utf8");
const rehearsalWorkflow = yaml.load(rehearsalSource);
const ciWorkflowPath = path.join(repositoryRoot, ".github/workflows/ci.yml");
const ciSource = fs.readFileSync(ciWorkflowPath, "utf8");
const ciWorkflow = yaml.load(ciSource);

const requiredJobs = [
  "staging_data",
  "staging_deploy",
  "staging_postdeploy",
  "staging_failure_report",
  "production_request",
  "production_owner_approval",
  "production_data",
  "production_deploy",
  "production_postdeploy",
  "rollback_route",
];

function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function jobText(job) {
  return JSON.stringify(job ?? {}).toLowerCase();
}

function environmentName(job) {
  if (typeof job?.environment === "string") return job.environment;
  return job?.environment?.name;
}

function expectDependency(jobId, dependencyId) {
  expect(asArray(jobs[jobId]?.needs), `${jobId} must need ${dependencyId}`).toContain(
    dependencyId,
  );
}

function expectFailClosed(jobId) {
  const job = jobs[jobId];
  expect(job?.["continue-on-error"], `${jobId} must fail closed`).not.toBe(true);
  for (const step of job?.steps ?? []) {
    expect(
      step?.["continue-on-error"],
      `${jobId}/${step?.name ?? "unnamed step"} must fail closed`,
    ).not.toBe(true);
  }
}

function expectAlwaysUploadedEvidence(jobId) {
  const uploads = (jobs[jobId]?.steps ?? []).filter((step) =>
    String(step?.uses ?? "").startsWith("actions/upload-artifact@"),
  );

  expect(uploads, `${jobId} must upload evidence`).not.toHaveLength(0);
  for (const upload of uploads) {
    expect(String(upload.if ?? ""), `${jobId} evidence must upload on failure`).toMatch(
      /always\(\)/,
    );
    expect(
      Number(upload.with?.["retention-days"]),
      `${jobId} evidence must be retained for 90 days`,
    ).toBeGreaterThanOrEqual(90);
    expect(upload.with?.["if-no-files-found"], `${jobId} cannot omit evidence`).toBe(
      "error",
    );
  }
}

function runText(job) {
  return (job?.steps ?? [])
    .map((step) => String(step?.run ?? ""))
    .join("\n");
}

function stepIndex(job, pattern) {
  return (job?.steps ?? []).findIndex((step) => pattern.test(String(step?.name ?? "")));
}

describe("protected staging and production data-promotion workflow", () => {
  it("pins every external action to the reviewed immutable commit with a readable version comment", () => {
    const reviewedPins = new Map([
      ["actions/checkout", ["fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09", "v5"]],
      ["actions/setup-node", ["a0853c24544627f65ddf259abe73b1d18a591444", "v5"]],
      ["actions/upload-artifact", ["ea165f8d65b6e75b540449e92b4886f43607fa02", "v4"]],
      ["actions/download-artifact", ["634f93cb2916e3fdff6788551b99b062d0335ce0", "v5"]],
      ["actions/attest-build-provenance", ["977bb373ede98d70efdf65b84cb5f73e068dcc2a", "v3"]],
      ["pnpm/action-setup", ["b906affcce14559ad1aafd4ab0e942779e9f58b1", "v4"]],
    ]);
    for (const [file, workflowSource] of [
      ["ci.yml", ciSource],
      ["cloudflare-pages-deploy.yml", source],
      ["data-migration-rehearsal.yml", rehearsalSource],
    ]) {
      const actionLines = workflowSource.split("\n").filter((line) => /\buses:\s*[^.\/][^\s]+@/.test(line));
      expect(actionLines.length, `${file} must contain reviewed actions`).toBeGreaterThan(0);
      for (const line of actionLines) {
        const match = /uses:\s*([^@\s]+)@([0-9a-f]{40})\s+#\s+(v\d+)\s*$/.exec(line);
        expect(match, `${file} action must use an immutable SHA and version comment: ${line.trim()}`).not.toBeNull();
        const [, action, sha, version] = match;
        expect(reviewedPins.get(action), `${file} uses an unreviewed action ${action}`).toEqual([sha, version]);
      }
    }
  });

  it("has the complete, fail-closed job graph", () => {
    expect(Object.keys(jobs)).toEqual(expect.arrayContaining(requiredJobs));

    expectDependency("staging_deploy", "staging_data");
    expectDependency("staging_postdeploy", "staging_deploy");
    for (const dependency of ["staging_data", "staging_deploy", "staging_postdeploy"]) {
      expectDependency("staging_failure_report", dependency);
    }
    expectDependency("production_data", "production_request");
    expectDependency("production_deploy", "production_data");
    expectDependency("production_postdeploy", "production_deploy");

    for (const prerequisite of [
      "production_data",
      "production_deploy",
      "production_postdeploy",
    ]) {
      expectDependency("rollback_route", prerequisite);
    }

    for (const jobId of requiredJobs) expectFailClosed(jobId);
  });

  it("keeps the local and PR checks ordered before build eligibility", () => {
    const ciJobs = ciWorkflow.jobs ?? {};
    expect(asArray(ciJobs["data-regressions"]?.needs)).toEqual(
      expect.arrayContaining(["quality", "database"]),
    );
    expect(asArray(ciJobs.build?.needs)).toEqual(
      expect.arrayContaining(["quality", "database", "data-regressions"]),
    );
    for (const [jobId, job] of Object.entries(ciJobs)) {
      expect(job?.["continue-on-error"], `${jobId} must fail closed`).not.toBe(true);
      for (const step of job?.steps ?? []) {
        expect(step?.["continue-on-error"], `${jobId}/${step?.name ?? "unnamed"} must fail closed`).not.toBe(true);
      }
    }
  });

  it("allows automatic pushes only to staging", () => {
    const triggers = workflow.on ?? {};
    const pushBranches = asArray(triggers.push?.branches);

    expect(triggers.workflow_dispatch).toBeDefined();
    expect(pushBranches).toContain("staging");
    expect(pushBranches).not.toContain("main");
    expect(pushBranches).not.toContain("**");

    expect(jobText(jobs.production_request)).toMatch(/workflow_dispatch/);
  });

  it("serializes promotions without cancelling a production run", () => {
    const concurrency = workflow.concurrency;

    expect(String(concurrency?.group ?? "")).toMatch(
      /(ref_name|environment|target_environment)/,
    );
    const cancellation = concurrency?.["cancel-in-progress"];
    if (typeof cancellation === "boolean") {
      expect(cancellation).toBe(false);
    } else {
      expect(String(cancellation ?? "")).toMatch(/(main|production|staging)/);
    }
  });

  it("keeps production credentials inside protected production jobs", () => {
    expect(jobText({ env: workflow.env })).not.toMatch(/secrets\./);
    expect(jobText(jobs.production_request)).not.toMatch(/secrets\./);

    for (const jobId of [
      "production_data",
      "production_deploy",
      "production_postdeploy",
    ]) {
      expect(environmentName(jobs[jobId]), `${jobId} must use protected production`).toBe(
        "production",
      );
    }

    for (const [jobId, job] of Object.entries(jobs)) {
      if (!jobText(job).includes("secrets.")) continue;
      expect(
        ["staging", "production"],
        `${jobId} uses credentials without a protected environment`,
      ).toContain(environmentName(job));
    }

    const permissions = workflow.permissions ?? {};
    expect(permissions.contents).toBe("read");
    for (const [scope, access] of Object.entries(permissions)) {
      if (access === "write") expect(scope).toBe("id-token");
    }
    for (const [jobId, job] of Object.entries(jobs)) {
      for (const [scope, access] of Object.entries(job.permissions ?? {})) {
        if (access === "write") {
          expect(
            scope === "id-token" ||
              (jobId === "production_data" && scope === "attestations"),
            `${jobId} requests an unnecessary write permission`,
          ).toBe(true);
        }
      }
    }
  });

  it("separates production invariant and backup keys and exposes them only to the protected executor step", () => {
    const secretNames = [
      "PRODUCTION_INVARIANT_HMAC_KEY",
      "PRODUCTION_BACKUP_ENCRYPTION_KEY",
    ];
    const dataSteps = jobs.production_data.steps ?? [];
    const executor = dataSteps.find((step) => String(step.run ?? "").includes("production-executor.mjs data"));
    expect(executor).toBeDefined();
    expect(executor.env?.PRODUCTION_INVARIANT_HMAC_KEY).toBe(
      "${{ secrets.PRODUCTION_INVARIANT_HMAC_KEY }}",
    );
    expect(executor.env?.PRODUCTION_BACKUP_ENCRYPTION_KEY).toBe(
      "${{ secrets.PRODUCTION_BACKUP_ENCRYPTION_KEY }}",
    );

    for (const [jobId, job] of Object.entries(jobs)) {
      for (const step of job.steps ?? []) {
        if (jobId === "production_data" && step === executor) continue;
        for (const secret of secretNames) {
          expect(JSON.stringify(step), `${secret} leaked to ${jobId}/${step.name ?? "unnamed"}`).not.toContain(secret);
        }
      }
    }

    const stagingIdentity = jobs.staging_data.steps.find((step) =>
      String(step.name ?? "").includes("Identity allowlist"),
    );
    expect(JSON.stringify(stagingIdentity)).not.toContain("INVARIANT_HMAC_KEY");
  });

  it("maps dispatch inputs through environment variables and validates them before shell use", () => {
    for (const [name, candidate] of [
      ["production", workflow],
      ["rehearsal", rehearsalWorkflow],
    ]) {
      const allRunScripts = Object.values(candidate.jobs ?? {}).map(runText).join("\n");
      expect(allRunScripts, `${name} shell must not interpolate dispatch inputs`).not.toMatch(
        /\$\{\{\s*inputs\./,
      );

      const validationJobs = Object.values(candidate.jobs ?? {}).filter((job) =>
        runText(job).includes("validate-workflow-inputs.mjs"),
      );
      expect(validationJobs.length, `${name} must consume mapped dispatch inputs`).toBeGreaterThan(0);
      for (const job of validationJobs) {
        expect(Object.values(job.env ?? {}).map(String)).toContain(
          "${{ inputs.expected_commit }}",
        );
        expect(jobText(job), `${name} inputs must be validated before use`).toMatch(
          /validate (production |rehearsal )?dispatch inputs/,
        );
      }
    }
  });

  it("rejects malicious production and rehearsal dispatch values before they reach commands", () => {
    const validator = path.join(repositoryRoot, "scripts/data/validate-workflow-inputs.mjs");
    const productionEnv = {
      ...process.env,
      GITHUB_SHA: "a".repeat(40),
      EXPECTED_COMMIT: "a".repeat(40),
      MIGRATION_FROM: "0024_safe_template_evolution.sql",
      MIGRATION_TO: "0024_safe_template_evolution.sql",
      MIGRATION_CLASSIFICATION: "backfill",
      CI_RUN_ID: "123",
      REHEARSAL_RUN_ID: "456",
      CONFIRM_PRODUCTION_DATABASE_ID: "b62ccc0a-9c69-4828-9e9b-3bac6ba0e4f1",
    };
    expect(spawnSync(process.execPath, [validator, "production"], { env: productionEnv }).status).toBe(0);
    expect(spawnSync(process.execPath, [validator, "production"], {
      env: { ...productionEnv, CI_RUN_ID: "123; touch /tmp/unsafe" },
    }).status).not.toBe(0);

    const rehearsalEnv = {
      ...process.env,
      GITHUB_SHA: "b".repeat(40),
      GITHUB_REF_PROTECTED: "true",
      EXPECTED_COMMIT: "b".repeat(40),
      DATABASE_NAME: "serplists-rehearsal-123",
      DATABASE_ID: "11111111-1111-4111-8111-111111111111",
      RECOVERY_DATABASE_NAME: "serp-checklists-rehearsal-recovery-123",
      RECOVERY_DATABASE_ID: "22222222-2222-4222-8222-222222222222",
      MIGRATION_FROM: "0024_safe_template_evolution.sql",
      MIGRATION_TO: "0024_safe_template_evolution.sql",
    };
    expect(spawnSync(process.execPath, [validator, "rehearsal"], { env: rehearsalEnv }).status).toBe(0);
    expect(spawnSync(process.execPath, [validator, "rehearsal"], {
      env: { ...rehearsalEnv, DATABASE_NAME: "safe; touch /tmp/unsafe" },
    }).status).not.toBe(0);
  });

  it("grants attestation write only to the job that produces provenance", () => {
    expect(jobs.production_data?.permissions?.attestations).toBe("write");
    expect(jobs.production_data?.permissions?.["id-token"]).toBe("write");
    for (const [jobId, job] of Object.entries(jobs)) {
      if (jobId === "production_data") continue;
      expect(job?.permissions?.attestations, `${jobId} must not mint attestations`).not.toBe(
        "write",
      );
    }
  });

  it("installs Chromium before the Playwright-backed regression suite in staging and rehearsal", () => {
    for (const [name, job] of [
      ["staging", jobs.staging_data],
      ["rehearsal", rehearsalWorkflow.jobs?.rehearsal],
    ]) {
      const installIndex = stepIndex(job, /install (playwright )?chromium/i);
      const regressionIndex = (job?.steps ?? []).findIndex((step) =>
        String(step?.run ?? "").includes("test:data-regressions"),
      );
      expect(installIndex, `${name} must install Chromium`).toBeGreaterThan(-1);
      expect(regressionIndex, `${name} must run data regressions`).toBeGreaterThan(-1);
      expect(installIndex, `${name} must install Chromium before regressions`).toBeLessThan(
        regressionIndex,
      );
      expect(String(job.steps[installIndex].run)).toContain(
        "playwright install --with-deps chromium",
      );
    }
  });

  it("proves recovery and data readiness before production deploy", () => {
    const request = jobText(jobs.production_request);
    const data = jobText(jobs.production_data);

    expect(request).toMatch(/(rehearsal|approved.*commit|artifact)/);
    expect(data).toMatch(/(identity|allowlist)/);
    expect(data).toMatch(/(bookmark|time travel|export|recovery)/);
    expect(data).toMatch(/migrat/);
    expect(data).toMatch(/(ledger|pending)/);
    expect(data).toMatch(/schema/);
    expect(data).toMatch(/invariant/);
    expect(data).toMatch(/report/);

    expectDependency("production_deploy", "production_data");
    expect(jobText(jobs.production_deploy)).not.toMatch(/continue-on-error[^}]*true/);
  });

  it("runs account-owned and custom-domain canaries after each deploy", () => {
    for (const jobId of ["staging_postdeploy", "production_postdeploy"]) {
      const text = jobText(jobs[jobId]);
      expect(text, `${jobId} must run after deploy`).toMatch(/(postdeploy|post-deploy|smoke)/);
      expect(text, `${jobId} must authenticate`).toMatch(/auth/);
      expect(text, `${jobId} must verify account-owned data`).toMatch(
        /(account-owned|visibility|template.*run|run.*template)/,
      );
      expect(text, `${jobId} must check the custom domain`).toMatch(/custom[- ]domain/);
    }
  });

  it("always retains machine and human evidence for at least 90 days", () => {
    for (const jobId of [
      "staging_data",
      "staging_postdeploy",
      "production_data",
      "production_postdeploy",
      "rollback_route",
    ]) {
      expectAlwaysUploadedEvidence(jobId);
    }

    const evidence = [
      jobs.production_data,
      jobs.production_postdeploy,
      jobs.rollback_route,
    ]
      .map(jobText)
      .join(" ");
    expect(evidence).toMatch(/\.json/);
    expect(evidence).toMatch(/(junit|\.xml)/);
    expect(evidence).toMatch(/(\.txt|\.md|human-readable)/);
  });

  it("retains Playwright test results and reports for staging and rehearsal", () => {
    for (const [name, job] of [["staging", jobs.staging_data], ["rehearsal", rehearsalWorkflow.jobs.rehearsal]]) {
      const upload = job.steps.find((step) => String(step.uses ?? "").startsWith("actions/upload-artifact@"));
      expect(String(upload.with.path), `${name} must retain test results`).toContain("tests/test-results/");
      expect(String(upload.with.path), `${name} must retain Playwright reports`).toContain("playwright-report/");
      expect(upload.if).toBe("always()");
      expect(upload.with["retention-days"]).toBeGreaterThanOrEqual(90);
    }
  });

  it("documents the explicit application-only none/none additive release without weakening gates", () => {
    const productionInputs = workflow.on.workflow_dispatch.inputs;
    const rehearsalInputs = rehearsalWorkflow.on.workflow_dispatch.inputs;
    expect(productionInputs.migration_from.description).toMatch(/none.*application-only/i);
    expect(productionInputs.migration_to.description).toMatch(/none.*application-only/i);
    expect(productionInputs.migration_classification.description).toMatch(/additive.*none\/none/i);
    expect(rehearsalInputs.migration_from.description).toMatch(/none.*application-only/i);
    expect(rehearsalInputs.migration_to.description).toMatch(/none.*application-only/i);
    expect(jobText(jobs.production_data)).toMatch(/ledger/);
    expect(jobText(jobs.production_data)).toMatch(/schema/);
    expect(jobText(jobs.production_data)).toMatch(/invariant/);
    expect(jobText(jobs.production_postdeploy)).toMatch(/authenticated/);
    expect(jobText(jobs.production_postdeploy)).toMatch(/custom-domain/);
  });

  it("routes any failed production stage to the rollback procedure", () => {
    const rollback = jobs.rollback_route;
    const condition = String(rollback?.if ?? "");
    const text = jobText(rollback);

    expect(condition).toMatch(/always\(\)/);
    expect(condition).toMatch(/github\.event_name == 'workflow_dispatch'/);
    expect(condition).toMatch(/github\.ref_name == 'main'/);
    expect(condition).toMatch(/needs\.production_request\.result == 'success'/);
    expect(condition).not.toMatch(/needs\.production_request\.result != 'success'/);
    expect(condition).not.toMatch(/\.result != 'success'/);
    expect(condition).toMatch(/needs\.production_data\.result == '(failure|cancelled)'/);
    expect(text).toMatch(/(rollback|roll-forward|recovery)/);
    expect(text).toMatch(/(procedure|workflow|incident|route)/);
    expect(text).toMatch(/request_expected_commit/);
    expect(text).toMatch(/request_database_id/);
    expect(text).toMatch(/environment.*production|production.*environment/);
  });

  it("reports every failed, cancelled, or skipped staging path with exact commit and environment", () => {
    const failure = jobs.staging_failure_report;
    const condition = String(failure?.if ?? "");
    const text = jobText(failure);
    expect(condition).toMatch(/always\(\)/);
    for (const jobId of ["staging_data", "staging_deploy", "staging_postdeploy"]) {
      expect(condition).toContain(`needs.${jobId}.result != 'success'`);
    }
    expect(text).toContain("report_commit");
    expect(text).toContain("report_environment");
    expect(text).toContain("staging");
    expect(text).toContain(".json");
    expect(text).toContain(".junit.xml");
    expect(text).toContain(".txt");
    expectAlwaysUploadedEvidence("staging_failure_report");
  });

  it("wires protected production export through sanitizer attestation and rehearsal import", () => {
    const sourceJob = rehearsalWorkflow.jobs.sanitized_source;
    const rehearsalJob = rehearsalWorkflow.jobs.rehearsal;
    const sourceText = runText(sourceJob);
    const rehearsalText = runText(rehearsalJob);
    expect(environmentName(sourceJob)).toBe("production");
    expect(sourceText).toContain("tmp/production-sensitive/rehearsal-source.sql");
    expect(sourceText).toContain("sanitize-rehearsal-export.mjs");
    expect(sourceText).toMatch(/trap .*production-sensitive/);
    expect(jobText(sourceJob)).toContain("attest-build-provenance");
    expect(String(sourceJob.steps.find((step) => String(step.uses ?? "").includes("upload-artifact"))?.with?.path)).not.toContain("production-sensitive");
    expect(asArray(rehearsalJob.needs)).toContain("sanitized_source");
    expect(rehearsalText).toContain("gh attestation verify");
    expect(rehearsalText).toContain("rehearsal-import");
    const baselineIndex = rehearsalJob.steps.findIndex((step) => String(step.run ?? "").includes("rehearsal-baseline"));
    const importIndex = rehearsalJob.steps.findIndex((step) => String(step.run ?? "").includes("rehearsal-import"));
    expect(baselineIndex).toBeGreaterThan(-1);
    expect(baselineIndex).toBeLessThan(importIndex);
    expect(String(rehearsalJob.steps[baselineIndex].run)).toContain('--before "$MIGRATION_FROM"');
  });

  it("fetches full history before calculating the exact staging migration range", () => {
    const checkout = jobs.staging_data.steps.find((step) => String(step.uses ?? "").startsWith("actions/checkout@"));
    expect(checkout?.with?.["fetch-depth"]).toBe(0);
    expect(runText(jobs.staging_data)).toContain("check-staging-reviewed-range.mjs");
    expect(jobs.staging_data.steps.find((step) => String(step.run ?? "").includes("check-staging-reviewed-range.mjs"))?.env?.STAGING_BASE_SHA).toBe("${{ github.event.before }}");
  });

  it("performs a real separate-database recovery restore and never uploads plaintext", () => {
    const rehearsal = rehearsalWorkflow.jobs.rehearsal;
    const text = runText(rehearsal);
    expect(rehearsalWorkflow.on.workflow_dispatch.inputs.recovery_database_id.required).toBe(true);
    expect(text).toContain("recovery-restore");
    expect(text).toContain("$RECOVERY_DATABASE_ID");
    expect(text).toContain("remote-invariant-gate.mjs compare");
    expect(text).toContain("finalize-recovery-rehearsal.mjs");
    expect(text).toMatch(/rm -f tmp\/rehearsal-sensitive\/recovery\.sql/);
    const upload = rehearsal.steps.find((step) => String(step.uses ?? "").includes("upload-artifact"));
    expect(String(upload.with.path)).not.toContain("rehearsal-sensitive");
    const cleanupSteps = rehearsal.steps.filter((step) => /always teardown .* rehearsal/i.test(String(step.name)));
    expect(cleanupSteps).toHaveLength(2);
    expect(cleanupSteps.every((step) => step.if === "always()")).toBe(true);
    expect(cleanupSteps.every((step) => String(step.run).includes("mkdir -p tmp/data-reports/rehearsal"))).toBe(true);
  });

  it("binds approvals to PR authors and a separate verified owner gate", () => {
    expect(jobText(jobs.production_request)).toMatch(/commits.*pulls|change-pulls/);
    expect(jobText(jobs.production_request)).toContain("change-provenance");
    expect(environmentName(jobs.production_owner_approval)).toBe("production-owner-approval");
    expectDependency("production_owner_approval", "production_request");
    expectDependency("production_data", "production_owner_approval");
    const dataText = runText(jobs.production_data);
    expect(dataText).toContain("actions/runs/$GITHUB_RUN_ID/approvals");
    expect(dataText).toContain("collaborators/$REPOSITORY_OWNER_APPROVER/permission");
    expect(dataText).toContain("--provenance tmp/change-provenance.json");
    expect(source).not.toContain("REQUEST_APPROVAL_DECISION");
  });
});
