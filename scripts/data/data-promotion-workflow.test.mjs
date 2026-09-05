import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

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
const codeownersSource = fs.readFileSync(path.join(repositoryRoot, ".github/CODEOWNERS"), "utf8");
const productionFinalizerSource = fs.readFileSync(path.join(repositoryRoot, "scripts/data/finalize-production-release.mjs"), "utf8");
const incidentRunbookSource = fs.readFileSync(path.join(repositoryRoot, "docs/knowledge/incident-response-runbook.md"), "utf8");

const requiredJobs = [
  "staging_data",
  "staging_deploy",
  "staging_postdeploy",
  "staging_failure_report",
  "production_request",
  "production_preparation",
  "production_owner_approval",
  "production_data",
  "production_deploy",
  "production_postdeploy",
  "production_failure_report",
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

  it("routes the migration provenance manifest to the existing accountable owner", () => {
    expect(codeownersSource).toMatch(/^\/db\/migration-provenance\.json\s+@devinschumacher$/m);
    const codeownerLines = new Set(codeownersSource.split(/\r?\n/).map((line) => line.trim()));
    for (const safetyPath of [
      "/scripts/hooks/",
      "/scripts/install-lefthook.mjs",
      "/scripts/run-playwright-smoke.mjs",
      "/lefthook.yml",
      "/playwright.config.ts",
      "/tests/e2e/data-visibility-regression.spec.ts",
      "/tests/e2e/sanitized-rehearsal-handler.spec.ts",
    ]) {
      expect(codeownerLines.has(`${safetyPath} @devinschumacher`), `${safetyPath} must route to the accountable owner`).toBe(true);
    }
  });

  it("rejects arbitrary rehearsal commits before checkout, install, or protected secrets", () => {
    for (const [jobId, job] of Object.entries(rehearsalWorkflow.jobs ?? {})) {
      const steps = job.steps ?? [];
      const gate = steps[0];
      expect(gate?.name, `${jobId} must gate the commit first`).toMatch(/untrusted rehearsal commit/i);
      expect(gate?.shell).toBe("bash");
      expect(String(gate?.run ?? "")).toMatch(/\^\[0-9a-f\]\{40\}\$/);
      expect(String(gate?.run ?? "")).toContain('test "$GITHUB_REF" = refs/heads/main');
      expect(String(gate?.run ?? "")).toContain('test "${GITHUB_REF_PROTECTED:-false}" = true');
      expect(String(gate?.run ?? "")).toContain('test "$EXPECTED_COMMIT" = "$GITHUB_SHA"');

      const checkoutIndex = steps.findIndex((step) => String(step.uses ?? "").startsWith("actions/checkout@"));
      const installIndex = steps.findIndex((step) => String(step.run ?? "").includes("pnpm install"));
      const secretIndex = steps.findIndex((step) => JSON.stringify(step.env ?? {}).includes("secrets."));
      expect(checkoutIndex, `${jobId} checkout must follow the inline gate`).toBeGreaterThan(0);
      expect(installIndex, `${jobId} install must follow the inline gate`).toBeGreaterThan(checkoutIndex);
      expect(secretIndex, `${jobId} secrets must follow the inline gate`).toBeGreaterThan(installIndex);
      expect(steps[checkoutIndex].with?.ref).toBe("${{ github.sha }}");
      expect(JSON.stringify(steps[checkoutIndex])).not.toContain("inputs.expected_commit");

      const trustedCommit = "a".repeat(40);
      const inlineGate = `${gate.run}\nprintf 'reached-privileged-steps\\n'`;
      const baseEnv = {
        ...process.env,
        EXPECTED_COMMIT: trustedCommit,
        GITHUB_SHA: trustedCommit,
        GITHUB_REF: "refs/heads/main",
        GITHUB_REF_PROTECTED: "true",
      };
      expect(spawnSync("bash", ["-c", inlineGate], { env: baseEnv }).stdout.toString()).toContain(
        "reached-privileged-steps",
      );
      for (const env of [
        { ...baseEnv, EXPECTED_COMMIT: "b".repeat(40) },
        { ...baseEnv, EXPECTED_COMMIT: "main" },
        { ...baseEnv, GITHUB_REF_PROTECTED: "false" },
      ]) {
        const result = spawnSync("bash", ["-c", inlineGate], { env });
        expect(result.status, `${jobId} must reject the untrusted context`).not.toBe(0);
        expect(result.stdout.toString()).not.toContain("reached-privileged-steps");
      }
    }

    for (const candidate of [workflow, rehearsalWorkflow]) {
      for (const job of Object.values(candidate.jobs ?? {})) {
        for (const step of job.steps ?? []) {
          if (!String(step.uses ?? "").startsWith("actions/checkout@")) continue;
          expect(JSON.stringify(step), "privileged checkout cannot select a caller-provided commit").not.toContain(
            "inputs.expected_commit",
          );
        }
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
    expect(asArray(jobs.production_preparation.needs)).toEqual(['production_request']);
    expect(asArray(jobs.production_owner_approval.needs)).toEqual(['production_preparation']);
    expect(asArray(jobs.production_data.needs)).toEqual(['production_preparation', 'production_owner_approval']);
    expectDependency("production_deploy", "production_data");
    expectDependency("production_postdeploy", "production_deploy");

    for (const prerequisite of [
      "production_data",
      "production_deploy",
      "production_postdeploy",
    ]) {
      expectDependency("production_failure_report", prerequisite);
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

    const credentialEnvironments = { staging_data: 'staging', staging_deploy: 'staging', staging_postdeploy: 'staging', production_preparation: 'production-preparation', production_data: 'production', production_deploy: 'production', production_postdeploy: 'production' };
    for (const [jobId, job] of Object.entries(jobs)) {
      if (!jobText(job).includes("secrets.")) continue;
      expect(Object.hasOwn(credentialEnvironments, jobId), `${jobId} is not an approved credential-bearing job`).toBe(true);
      expect(environmentName(job), `${jobId} uses credentials outside its exact protected environment`).toBe(credentialEnvironments[jobId]);
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

  it("restricts distinct production keys and read/write tokens to exact protected operation steps", () => {
    const secretNames = [
      "PRODUCTION_INVARIANT_HMAC_KEY",
      "PRODUCTION_BACKUP_ENCRYPTION_KEY",
      "PRODUCTION_CANARY_EVIDENCE_HMAC_KEY",
    ];
    const dataSteps = jobs.production_data.steps ?? [];
    const executor = dataSteps.find((step) => String(step.run ?? "").includes("production-executor.mjs data"));
    const preparation = jobs.production_preparation.steps.find(step => String(step.run ?? '').includes('production-executor.mjs prepare'));
    expect(preparation).toBeDefined();
    expect(environmentName(jobs.production_preparation)).toBe('production-preparation');
    expect(preparation.env.DATA_PROTECTED_ENVIRONMENT).toBe('production-preparation');
    expect(executor).toBeDefined();
    expect(executor.env?.PRODUCTION_INVARIANT_HMAC_KEY).toBe(
      "${{ secrets.PRODUCTION_INVARIANT_HMAC_KEY }}",
    );
    expect(executor.env?.PRODUCTION_BACKUP_ENCRYPTION_KEY).toBe(
      "${{ secrets.PRODUCTION_BACKUP_ENCRYPTION_KEY }}",
    );
    expect(executor.env?.PRODUCTION_CANARY_EVIDENCE_HMAC_KEY).toBe(
      "${{ secrets.PRODUCTION_CANARY_EVIDENCE_HMAC_KEY }}",
    );
    const productionSmoke = jobs.production_postdeploy.steps.find((step) => step.env?.DATA_CANARY_EVIDENCE_HMAC_KEY);
    expect(productionSmoke.env.DATA_CANARY_EVIDENCE_HMAC_KEY).toBe(executor.env.PRODUCTION_CANARY_EVIDENCE_HMAC_KEY);
    const productionDeploy = jobs.production_deploy.steps.find(step => step.name === 'Deploy exact compatible production commit');
    expect(productionDeploy).toBeDefined();
    expect(productionDeploy.run).toContain('pnpm exec wrangler pages deploy');
    const readonlyToken = '${{ secrets.PRODUCTION_READONLY_CLOUDFLARE_API_TOKEN }}';
    const writeToken = '${{ secrets.PRODUCTION_CLOUDFLARE_API_TOKEN }}';
    expect(preparation.env.CLOUDFLARE_API_TOKEN).toBe(readonlyToken);
    for (const step of [executor, productionDeploy, productionSmoke]) expect(step.env.CLOUDFLARE_API_TOKEN).toBe(writeToken);
    for (const step of [preparation, executor]) for (const secret of secretNames) expect(step.env[secret]).toBe(`\${{ secrets.${secret} }}`);
    for (const [jobId, job] of Object.entries(jobs).filter(([id]) => id.startsWith("staging_"))) {
      expect(JSON.stringify(job), jobId).not.toContain("secrets.PRODUCTION_");
    }

    for (const [jobId, job] of Object.entries(jobs)) {
      for (const secret of secretNames) expect(JSON.stringify(job.env ?? {}), `${secret} must remain step scoped`).not.toContain(secret);
      for (const step of job.steps ?? []) {
        const text = JSON.stringify(step);
        if (text.includes(readonlyToken)) expect(jobId === 'production_preparation' && step === preparation).toBe(true);
        if (text.includes(writeToken)) expect((jobId === 'production_data' && step === executor) || (jobId === 'production_deploy' && step === productionDeploy) || (jobId === 'production_postdeploy' && step === productionSmoke)).toBe(true);
        for (const secret of secretNames) {
          const protectedKeyStep = (jobId === 'production_preparation' && step === preparation) || (jobId === 'production_data' && step === executor);
          const protectedCanaryStep = secret === 'PRODUCTION_CANARY_EVIDENCE_HMAC_KEY' && jobId === 'production_postdeploy' && step === productionSmoke;
          if (!protectedKeyStep && !protectedCanaryStep) expect(text, `${secret} leaked to ${jobId}/${step.name ?? "unnamed"}`).not.toContain(secret);
          else {
            const reference = `\${{ secrets.${secret} }}`;
            expect(text.split(reference).length - 1, `${secret} must be referenced exactly once in its approved step`).toBe(1);
            expect(Object.entries(step.env ?? {}).filter(([, value]) => value === reference).map(([name]) => name)).toEqual([protectedCanaryStep ? 'DATA_CANARY_EVIDENCE_HMAC_KEY' : secret]);
          }
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
      STAGING_RUN_ID: "234",
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

  it('persists and verifies exact recovery before approval and re-verifies it before the write executor', () => {
    const preparation = jobs.production_preparation;
    const steps = preparation.steps;
    const prepare = steps.findIndex(step => step.id === 'prepare');
    const upload = steps.findIndex(step => step.id === 'upload');
    const download = steps.findIndex(step => String(step.uses ?? '').startsWith('actions/download-artifact@') && step.with?.['artifact-ids']);
    const verify = steps.findIndex(step => String(step.run ?? '').includes('verify-production-preparation.mjs'));
    expect(prepare).toBeGreaterThan(-1);
    expect(upload).toBeGreaterThan(prepare);
    expect(download).toBeGreaterThan(upload);
    expect(verify).toBeGreaterThan(download);
    expect(steps[prepare].run).toContain('production-executor.mjs prepare --request tmp/production-request.json');
    expect(steps[upload].with.path).toContain('tmp/recovery/');
    expect(steps[upload].with.path).toContain('tmp/production-request.json');
    expect(steps[upload].with.path).not.toContain('production-sensitive');
    expect(steps[upload].with['if-no-files-found']).toBe('error');
    expect(steps[upload].with['retention-days']).toBeGreaterThanOrEqual(90);
    expect(steps[download].with['artifact-ids']).toBe('${{ steps.upload.outputs.artifact-id }}');
    expect(steps[download].with.path).toBe('tmp/verified-recovery');
    expect(steps[verify].env.RECOVERY_ID).toBe('${{ steps.upload.outputs.artifact-id }}');
    expect(steps[verify].env.RECOVERY_DIGEST).toBe('${{ steps.prepare.outputs.preparation_digest }}');
    for (const parameter of ['--request tmp/verified-recovery/production-request.json', '--preparation tmp/verified-recovery/recovery/production-preparation.json', '--encrypted-export', '--preparation-digest "$RECOVERY_DIGEST"', '--artifact-id "$RECOVERY_ID"']) expect(steps[verify].run).toContain(parameter);
    expect(preparation.outputs.artifact_id).toBe('${{ steps.upload.outputs.artifact-id }}');
    expect(preparation.outputs.preparation_digest).toBe('${{ steps.prepare.outputs.preparation_digest }}');
    expect(asArray(jobs.production_owner_approval.needs)).toEqual(['production_preparation']);
    expect(environmentName(jobs.production_owner_approval)).toBe('production-owner-approval');
    expect(asArray(jobs.production_data.needs)).toEqual(['production_preparation', 'production_owner_approval']);
    expect(jobs.production_data.if).toContain("needs.production_preparation.result == 'success'");
    expect(jobs.production_data.if).toContain("needs.production_owner_approval.result == 'success'");
    expect(environmentName(jobs.production_data)).toBe('production');
    const dataSteps = jobs.production_data.steps;
    const dataDownload = dataSteps.findIndex(step => step.with?.['artifact-ids']);
    const dataVerify = dataSteps.findIndex(step => String(step.run ?? '').includes('verify-production-preparation.mjs'));
    const approval = dataSteps.findIndex(step => String(step.run ?? '').includes('capture-production-approval.mjs'));
    const execute = dataSteps.findIndex(step => String(step.run ?? '').includes('production-executor.mjs data'));
    expect(dataDownload).toBeGreaterThan(-1);
    expect(dataVerify).toBeGreaterThan(dataDownload);
    expect(approval).toBeGreaterThan(dataVerify);
    expect(execute).toBeGreaterThan(approval);
    expect(dataSteps[dataDownload].with['artifact-ids']).toBe('${{ needs.production_preparation.outputs.artifact_id }}');
    expect(jobs.production_data.env.RECOVERY_DIGEST).toBe('${{ needs.production_preparation.outputs.preparation_digest }}');
    expect(dataSteps[dataVerify].run).toContain('cmp tmp/production-request.json tmp/verified-recovery/production-request.json');
    expect(dataSteps[approval].run).toContain('--recovery-receipt tmp/recovery-receipt.json');
    for (const parameter of ['--approval tmp/production-approval.json', '--preparation tmp/verified-recovery/recovery/production-preparation.json', '--encrypted-export', '--artifact-id "$RECOVERY_ID"', '--preparation-digest "$RECOVERY_DIGEST"']) expect(dataSteps[execute].run).toContain(parameter);
  });

  it("requires exact staging promotion and protected-main push CI evidence before production request", () => {
    const request = jobs.production_request;
    const text = runText(request);
    expect(workflow.on.workflow_dispatch.inputs.staging_run_id.required).toBe(true);
    expect(request.env.STAGING_RUN_ID).toBe("${{ inputs.staging_run_id }}");
    expect(text).toContain('gh run download "$STAGING_RUN_ID"');
    expect(text).toContain("staging-promotion.json");
    expect(text).toContain("--staging-report");
    expect(text).toContain("--staging-run-metadata");
    expect(text).toMatch(/--event push --branch main --path \.github\/workflows\/ci\.yml/);
    expect(text).toMatch(/--event push --branch staging --path \.github\/workflows\/cloudflare-pages-deploy\.yml/);
    expect(text).toContain("--merge-commit tmp/change-merge-commit.json");
    expect(text).toContain("--change-provenance tmp/change-provenance.json");
  });

  it("uses the repository patch-pinned Node version in every workflow job", () => {
    for (const [name, candidate] of [["ci", ciWorkflow], ["promotion", workflow], ["rehearsal", rehearsalWorkflow]]) {
      for (const [jobId, job] of Object.entries(candidate.jobs ?? {})) {
        for (const step of job.steps ?? []) {
          if (!String(step.uses ?? "").startsWith("actions/setup-node@")) continue;
          expect(step.with?.["node-version-file"], `${name}/${jobId}`).toBe(".node-version");
          expect(step.with?.["node-version"], `${name}/${jobId} cannot float a major`).toBeUndefined();
        }
      }
    }
  });

  it("runs every repository JavaScript command only after checkout and pinned Node setup", () => {
    const workflows = [
      ["ci", ciWorkflow],
      ["promotion", workflow],
      ["rehearsal", rehearsalWorkflow],
    ];
    const executesRepositoryJavaScript = (step) => {
      const run = String(step.run ?? "");
      return /\bpnpm\s+(?:install|run|exec)\b/.test(run) || /\bnode\s+(?:\.\/)?scripts\//.test(run);
    };

    for (const [workflowName, candidate] of workflows) {
      for (const [jobId, job] of Object.entries(candidate.jobs ?? {})) {
        const steps = job.steps ?? [];
        const checkoutIndex = steps.findIndex((step) => String(step.uses ?? "").startsWith("actions/checkout@"));
        const nodeIndex = steps.findIndex((step) => String(step.uses ?? "").startsWith("actions/setup-node@"));
        for (const [stepIndex, step] of steps.entries()) {
          if (!executesRepositoryJavaScript(step)) continue;
          expect(checkoutIndex, `${workflowName}/${jobId} must checkout before ${step.name ?? stepIndex}`).toBeGreaterThanOrEqual(0);
          expect(nodeIndex, `${workflowName}/${jobId} must setup Node before ${step.name ?? stepIndex}`).toBeGreaterThan(checkoutIndex);
          expect(stepIndex, `${workflowName}/${jobId}/${step.name ?? stepIndex} ran before pinned Node`).toBeGreaterThan(nodeIndex);
          expect(steps[nodeIndex].with?.["node-version-file"], `${workflowName}/${jobId} must use .node-version`).toBe(".node-version");
        }
      }
    }
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
      expect(text).toContain("data_canary_template_id");
      expect(text).toContain("data_canary_run_id");
      expect(text).toContain("data_canary_mutation_approved");
      expect(text).toContain("data_canary_evidence_hmac_key");
      expect(text).toMatch(/read write readback restore/i);
    }
  });

  it("always retains machine and human evidence for at least 90 days", () => {
    for (const jobId of [
      "staging_data",
      "staging_postdeploy",
      "production_data",
      "production_postdeploy",
      "production_failure_report",
    ]) {
      expectAlwaysUploadedEvidence(jobId);
    }

    const evidence = [
      jobs.production_data,
      jobs.production_postdeploy,
      jobs.production_failure_report,
    ]
      .map(jobText)
      .join(" ");
    expect(evidence).toMatch(/\.json/);
    expect(evidence).toMatch(/(junit|\.xml)/);
    expect(evidence).toMatch(/(\.txt|\.md|human-readable)/);
  });

  it("retains Playwright test results and reports for staging and rehearsal", () => {
    for (const [name, job] of [["staging", jobs.staging_data], ["rehearsal", rehearsalWorkflow.jobs.rehearsal]]) {
      const upload = job.steps.find((step) =>
        String(step.uses ?? "").startsWith("actions/upload-artifact@") &&
        String(step.with?.path ?? "").includes("tests/test-results/"),
      );
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

  it("stops failed production stages without exposing a restore route", () => {
    const failureReport = jobs.production_failure_report;
    const condition = String(failureReport?.if ?? "");
    const text = jobText(failureReport);

    expect(condition).toMatch(/always\(\)/);
    expect(condition).toMatch(/github\.event_name == 'workflow_dispatch'/);
    expect(condition).toMatch(/github\.ref_name == 'main'/);
    expect(condition).toMatch(/needs\.production_request\.result == 'success'/);
    expect(condition).not.toMatch(/needs\.production_request\.result != 'success'/);
    expect(condition).not.toMatch(/\.result != 'success'/);
    expect(condition).toMatch(/needs\.production_data\.result == '(failure|cancelled)'/);
    expect(text).toMatch(/automatic.*recovery.*forbidden/);
    expect(text).toMatch(/fresh exact-target approval/);
    expect(text).toMatch(/protected recovery executor or break-glass/);
    expect(text).toMatch(/request_expected_commit/);
    expect(text).toMatch(/request_database_id/);
    expect(text).toMatch(/environment.*production|production.*environment/);
    expect(text).not.toMatch(/time-travel.*restore|d1.*restore|incident-response-runbook/);
    expect(jobs.rollback_route).toBeUndefined();
  });

  it("documents production recovery only through fresh exact-target protected authorization", () => {
    expect(productionFinalizerSource).not.toMatch(/rollbackRoute|incident-response-runbook/);
    expect(incidentRunbookSource).not.toMatch(/wrangler\s+d1\s+time-travel\s+restore/i);
    expect(incidentRunbookSource).toMatch(/fresh independent human approval/i);
    expect(incidentRunbookSource).toMatch(/exact production name[\s\S]*uuid[\s\S]*commit[\s\S]*recovery point/i);
    expect(incidentRunbookSource).toMatch(/newly created isolated non-production database/i);
    expect(incidentRunbookSource).toMatch(/identity immediately before and[\s\S]*after the restore/i);
    expect(incidentRunbookSource).toMatch(/ledger\/schema\/invariant\/authenticated checks/i);
    expect(incidentRunbookSource).toMatch(/protected recovery executor[\s\S]*break-glass/i);
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
    expect(sourceText).toContain("production-identity-bound-command.mjs sanitizer-export");
    expect(sourceText).toContain("--source-identity-evidence tmp/data-evidence/production-shaped.identity.json");
    expect(sourceText).not.toContain("pnpm exec wrangler d1 export serp-checklists-db");
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
    const rangeIndex = jobs.staging_data.steps.findIndex((step) => String(step.run ?? "").includes("check-staging-reviewed-range.mjs"));
    const captureIndex = jobs.staging_data.steps.findIndex((step) => String(step.run ?? "").includes("remote-invariant-gate.mjs capture"));
    expect(rangeIndex).toBeLessThan(captureIndex);
    expect(String(jobs.staging_data.steps[captureIndex].run)).toContain('--migration-from "$MIGRATION_FROM"');
  });

  it("performs a real separate-database recovery restore and never uploads plaintext", () => {
    const rehearsal = rehearsalWorkflow.jobs.rehearsal;
    const text = runText(rehearsal);
    expect(rehearsalWorkflow.on.workflow_dispatch.inputs.recovery_database_id).toBeUndefined();
    expect(text).toContain("rehearsal-create");
    expect(text).toContain("recovery-creation.json");
    expect(text).toContain("recovery-restore");
    expect(text).toContain("$RECOVERY_DATABASE_ID");
    expect(text).toContain("remote-invariant-gate.mjs compare");
    expect(text).toContain("finalize-recovery-rehearsal.mjs");
    expect(text).toMatch(/rm -f tmp\/rehearsal-sensitive\/recovery\.sql/);
    expect(text).toMatch(/recovery-export-identity-before[\s\S]*wrangler d1 export[\s\S]*recovery-export-identity-after/);
    const upload = rehearsal.steps.find((step) => String(step.uses ?? "").includes("upload-artifact"));
    expect(String(upload.with.path)).not.toContain("rehearsal-sensitive");
    const cleanupSteps = rehearsal.steps.filter((step) => /always teardown .* rehearsal/i.test(String(step.name)));
    expect(cleanupSteps).toHaveLength(2);
    expect(cleanupSteps.every((step) => step.if === "always()")).toBe(true);
    expect(cleanupSteps.every((step) => String(step.run).includes("mkdir -p tmp/data-reports/rehearsal"))).toBe(true);
  });

  it("binds approvals to PR authors and a separate verified owner gate", () => {
    expect(jobText(jobs.production_request)).toMatch(/commits.*pulls|change-pulls/);
    expect(runText(jobs.production_request)).toContain("commits/$EXPECTED_COMMIT");
    expect(runText(jobs.production_request)).toContain("--merge-commit tmp/change-merge-commit.json");
    expect(runText(jobs.production_request)).toContain("--commit-authors tmp/change-commit-authors.json");
    expect(runText(jobs.production_request)).toContain("--merge-authors tmp/change-merge-authors.json");
    expect(jobText(jobs.production_request)).toContain("change-provenance");
    expect(environmentName(jobs.production_owner_approval)).toBe("production-owner-approval");
    expectDependency("production_owner_approval", "production_preparation");
    expectDependency("production_data", "production_owner_approval");
    const dataText = runText(jobs.production_data);
    expect(dataText).toContain("actions/runs/$GITHUB_RUN_ID/approvals");
    expect(dataText).toContain("collaborators/$REPOSITORY_OWNER_APPROVER/permission");
    expect(dataText).toContain("--provenance tmp/change-provenance.json");
    expect(source).not.toContain("REQUEST_APPROVAL_DECISION");
  });

  it("always writes early failure triads before rehearsal checkout and production evidence download", () => {
    const executableFinalizers = [];
    for (const [jobId, job] of Object.entries(rehearsalWorkflow.jobs)) {
      const gateIndex = job.steps.findIndex((step) => step.id === "commit_gate");
      const finalizerIndex = job.steps.findIndex((step) => /Finalize .*pre-checkout failure/.test(String(step.name)));
      const uploadIndex = job.steps.findIndex((step) => /Upload .*pre-checkout failure/.test(String(step.name)));
      const checkoutIndex = job.steps.findIndex((step) => String(step.uses ?? "").startsWith("actions/checkout@"));
      expect(gateIndex, jobId).toBe(0);
      expect(finalizerIndex, jobId).toBeGreaterThan(gateIndex);
      expect(uploadIndex, jobId).toBeGreaterThan(finalizerIndex);
      expect(checkoutIndex, jobId).toBeGreaterThan(uploadIndex);
      const evidence = jobText({ steps: [job.steps[finalizerIndex], job.steps[uploadIndex]] });
      for (const required of ["commit", "environment", "databasename", "databaseid", "migrationrange", "failedstage", "junit", ".json", ".txt"]) {
        expect(evidence, `${jobId} early report missing ${required}`).toContain(required);
      }
      executableFinalizers.push([jobId, job.steps[finalizerIndex], jobId === "sanitized_source" ? "tmp/early-failure/production-source" : "tmp/early-failure/rehearsal"]);
    }
    const productionGate = jobs.production_request.steps.findIndex((step) => step.id === "production_input_gate");
    const productionFinalizer = jobs.production_request.steps.findIndex((step) => /Finalize production-request input failure/.test(String(step.name)));
    const download = jobs.production_request.steps.findIndex((step) => String(step.name).includes("Download exact-commit"));
    expect(productionGate).toBeGreaterThan(-1);
    expect(productionFinalizer).toBeGreaterThan(productionGate);
    expect(download).toBeGreaterThan(productionFinalizer);
    expect(jobText({ steps: [jobs.production_request.steps[productionFinalizer]] })).toMatch(/commit.*environment.*databasename.*databaseid.*migrationrange.*failedstage/);
    executableFinalizers.push(["production_request", jobs.production_request.steps[productionFinalizer], "tmp/data-reports/production-request"]);

    for (const [name, finalizer, relativeDirectory] of executableFinalizers) {
      const cwd = fs.mkdtempSync(path.join(tmpdir(), "early-workflow-report-"));
      try {
        const env = {
          ...process.env,
          REPORT_DIRECTORY: relativeDirectory,
          REPORT_COMMIT: "a".repeat(40),
          REPORT_ENVIRONMENT: name === "production_request" ? "production" : name,
          REPORT_DATABASE_NAME: "db<&name",
          REPORT_DATABASE_ID: "11111111-1111-4111-8111-111111111111",
          REPORT_MIGRATION_FROM: "0024_safe_template_evolution.sql",
          REPORT_MIGRATION_TO: "0024_safe_template_evolution.sql",
        };
        expect(spawnSync("bash", ["-c", finalizer.run], { cwd, env }).status, name).toBe(0);
        const directory = path.join(cwd, relativeDirectory);
        expect(JSON.parse(fs.readFileSync(path.join(directory, "early-failure.json"), "utf8"))).toMatchObject({
          verdict: "fail",
          commit: "a".repeat(40),
          target: { databaseName: "db<&name", databaseId: "11111111-1111-4111-8111-111111111111" },
          migrationRange: { from: "0024_safe_template_evolution.sql", to: "0024_safe_template_evolution.sql" },
        });
        expect(fs.readFileSync(path.join(directory, "early-failure.junit.xml"), "utf8")).toContain("db&lt;&amp;name");
        expect(fs.readFileSync(path.join(directory, "early-failure.txt"), "utf8")).toContain("db<&name");
      } finally {
        fs.rmSync(cwd, { recursive: true, force: true });
      }
    }
  });
});
