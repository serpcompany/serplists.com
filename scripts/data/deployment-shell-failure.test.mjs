import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, symlinkSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const workflow = yaml.load(readFileSync(path.join(root, ".github/workflows/cloudflare-pages-deploy.yml"), "utf8"));
const commit = "1".repeat(40);
const tree = "2".repeat(40);
const url = "https://abc123.serplists-com.pages.dev";

// Execute checked-in run bodies with GitHub's Linux Bash invocation. An omitted
// shell intentionally uses bash -e (without pipefail), reproducing the defect.
function runStep(job, step, cwd, env, outcome) {
  const shell = step.shell ?? job.defaults?.run?.shell ?? workflow.defaults?.run?.shell;
  expect([undefined, "bash"]).toContain(shell);
  const script = step.run.replace(/\$\{\{ steps\.(?:staging|production)_pages_deploy\.outcome \}\}/g, outcome ?? "unknown");
  expect(script).not.toContain("${{");
  const scriptPath = path.join(cwd, "step.sh");
  writeFileSync(scriptPath, script);
  return spawnSync("/bin/bash", shell === "bash"
    ? ["--noprofile", "--norc", "-e", "-o", "pipefail", scriptPath]
    : ["-e", scriptPath], { cwd, env, encoding: "utf8" });
}

function fixture(exitCode, brokenGrep = false) {
  const cwd = mkdtempSync(path.join(tmpdir(), "deployment-shell-"));
  const bin = path.join(cwd, "bin");
  mkdirSync(bin);
  mkdirSync(path.join(cwd, "tmp"));
  // No inherited PATH, secrets, shell startup files, or network-capable CLI.
  for (const command of ["mkdir", "tee", "grep", "tail", "sed", "wc", "tr"]) {
    const source = [`/usr/bin/${command}`, `/bin/${command}`].find(existsSync);
    expect(source).toBeDefined();
    symlinkSync(source, path.join(bin, command));
  }
  const executable = (name, source) => writeFileSync(path.join(bin, name), source, { mode: 0o755 });
  executable("pnpm", `#!/bin/bash\n[[ "$1 $2 $3 $4" == "exec wrangler pages deploy" ]] || exit 99\nprintf '%s\\n' '${url}'\nexit ${exitCode}\n`);
  executable("git", `#!/bin/bash\n[[ "$1 $2" == "rev-parse HEAD^{tree}" ]] || exit 99\nprintf '%s\\n' '${tree}'\n`);
  executable("node", `#!${process.execPath}
const [script, ...args] = process.argv.slice(2);
if (script === 'scripts/data/record-deployment.mjs') {
  const { spawnSync } = await import('node:child_process');
  const result = spawnSync(process.execPath, [${JSON.stringify(path.join(root, "scripts/data/record-deployment.mjs"))}, ...args], { stdio: 'inherit', env: process.env });
  process.exit(result.status ?? 99);
} else if (script === 'scripts/data/deployment-smoke.mjs') {
  const { writeFileSync } = await import('node:fs');
  writeFileSync('canary-started', 'local fake only');
} else if (script === 'scripts/data/select-range-evidence.mjs') {
  console.log('local-ci-report.json');
} else if (script === 'scripts/data/production-request.mjs') {
  const { writeFileSync } = await import('node:fs');
  writeFileSync('request-started', 'local fake only');
} else { process.exit(99); }
`);
  // .mjs extension is needed for the fake node dispatcher's top-level await.
  // Node 22 detects this syntax in the extensionless executable as an ES module.
  if (brokenGrep) {
    rmSync(path.join(bin, "grep"));
    executable("grep", `#!/bin/bash\nprintf '%s\\n' '${url}'\nexit 23\n`);
  }
  return { cwd, env: { PATH: bin, GITHUB_SHA: commit, CLOUDFLARE_PAGES_PROJECT: "serplists-com" } };
}

function assertDependencies(environment) {
  const deploy = workflow.jobs[`${environment}_deploy`];
  const post = workflow.jobs[`${environment}_postdeploy`];
  expect(deploy.needs).toBe(`${environment}_data`);
  expect(post.needs).toBe(`${environment}_deploy`);
  for (const job of [deploy, post]) {
    expect(job.if).toBeUndefined(); // implicit success(), never always()/failure()
    expect(job["continue-on-error"]).toBeUndefined();
    for (const step of job.steps) expect(step["continue-on-error"]).toBeUndefined();
  }
  const smoke = post.steps.find(step => step.run?.includes("scripts/data/deployment-smoke.mjs"));
  expect(smoke).toBeDefined();
  expect(smoke.if).toBeUndefined();
  expect(smoke.env.DATA_CANARY_MUTATION_APPROVED).toBe("true");
  return { deploy, post, smoke };
}

describe("privileged deployment shell failure propagation", () => {
  for (const environment of ["staging", "production"]) {
    it.each([23, 0])(`${environment}: deployer exit %i controls evidence and downstream canary eligibility`, exitCode => {
      const { deploy, post, smoke } = assertDependencies(environment);
      const deployStep = deploy.steps.find(step => step.run?.includes("pnpm exec wrangler pages deploy"));
      const recorder = deploy.steps.find(step => step.run?.includes("scripts/data/record-deployment.mjs"));
      const { cwd, env } = fixture(exitCode);
      try {
        const result = runStep(deploy, deployStep, cwd, env);
        expect(result.error).toBeUndefined();
        expect(result.stdout).toContain(url);
        expect(result.status, `actual ${environment} deploy shell must preserve exit ${exitCode}`).toBe(exitCode);
        expect(recorder).toBeDefined();
        expect(recorder.if).toBe("always()");
        expect(deployStep.id).toBe(`${environment}_pages_deploy`);
        expect(deploy.steps.indexOf(recorder)).toBeGreaterThan(deploy.steps.indexOf(deployStep));
        expect(recorder.run).toContain(`steps.${environment}_pages_deploy.outcome`);
        const recorded = runStep(deploy, recorder, cwd, env, result.status === 0 ? "success" : "failure");
        expect(recorded.status).toBe(exitCode === 0 ? 0 : 1);
        const report = JSON.parse(readFileSync(path.join(cwd, `tmp/data-reports/${environment}-deploy/${environment}-deploy.json`), "utf8"));
        expect(report.verdict).toBe(exitCode === 0 ? "pass" : "fail");
        expect(report.outcome).toBe(exitCode === 0 ? "success" : "failure");
        const upload = deploy.steps.find(step => step.uses?.startsWith("actions/upload-artifact@"));
        expect(upload.if).toBe("always()");
        expect(upload.with.path).toContain(`tmp/data-reports/${environment}-deploy/`);
        expect(upload.with["retention-days"]).toBeGreaterThanOrEqual(90);
        expect(readFileSync(path.join(cwd, environment === "staging"
          ? "tmp/data-reports/staging-deploy/deploy-output.txt" : "tmp/production-deploy.txt"), "utf8")).toContain(url);

        // Local scheduling model, guarded above by exact checked-in dependencies
        // and implicit-success conditions. It is not a GitHub runner simulation.
        let jobSucceeded = result.status === 0 && recorded.status === 0;
        if (environment === "production" && jobSucceeded) {
          const urlStep = deploy.steps.find(step => step.name === "Record exact deployment URL");
          expect(urlStep.if).toBeUndefined();
          expect(deploy.steps.indexOf(urlStep)).toBeGreaterThan(deploy.steps.indexOf(deployStep));
          jobSucceeded = runStep(deploy, urlStep, cwd, env).status === 0;
          expect(readFileSync(path.join(cwd, "tmp/production-deployment-url.txt"), "utf8").trim()).toBe(url);
        }
        if (jobSucceeded) expect(runStep(post, smoke, cwd, env).status).toBe(0);
        expect(existsSync(path.join(cwd, "canary-started"))).toBe(exitCode === 0);
        if (environment === "production" && exitCode !== 0) {
          expect(existsSync(path.join(cwd, "tmp/production-deployment-url.txt"))).toBe(false);
        }
      } finally { rmSync(cwd, { recursive: true, force: true }); }
    });
  }

  it("production URL extraction preserves a failing producer even with plausible output", () => {
    const job = workflow.jobs.production_deploy;
    const step = job.steps.find(step => step.name === "Record exact deployment URL");
    const { cwd, env } = fixture(0, true);
    try {
      const result = runStep(job, step, cwd, env);
      expect(result.status).toBe(23);
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });

  it.each(["staging", "rehearsal", "success"])("artifact-count pipeline %s control gates request creation", failingTarget => {
    const job = workflow.jobs.production_request;
    const step = job.steps.find(step => step.name === "Validate approved commit migration range and rehearsal artifact");
    const { cwd, env } = fixture(0);
    try {
      writeFileSync(path.join(cwd, "bin/find"), '#!/bin/bash\nprintf "%s/report.json\\n" "$1"\n', { mode: 0o755 });
      rmSync(path.join(cwd, "bin/sed"));
      // Emit exactly one plausible line before failure: the count still equals 1.
      writeFileSync(path.join(cwd, "bin/sed"), `#!/bin/bash\nread -r line\nprintf '%s\\n' "$line"\n[[ "$line" != *"/${failingTarget}/"* ]] || exit 23\n`, { mode: 0o755 });
      const result = runStep(job, step, cwd, env);
      expect(result.status).toBe(failingTarget === "success" ? 0 : 23);
      expect(existsSync(path.join(cwd, "request-started"))).toBe(failingTarget === "success");
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });
});
