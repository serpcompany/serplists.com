import { test } from "vitest";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync, execFileSync } from "node:child_process";
import { REPOSITORY, validatePublicationRun, originatingPulls, publicEvidence, renderPublication, upsertPublication } from "./publication-evidence-lib.mjs";

const sha = "a".repeat(40);
const run = { id: 123, run_attempt: 1, repository: { full_name: REPOSITORY }, head_repository: { full_name: REPOSITORY }, head_sha: sha, status: "completed", conclusion: "success", path: ".github/workflows/data-migration-rehearsal.yml", event: "workflow_dispatch", head_branch: "main" };
const envelope = { runId: 123, attempt: 1, commit: sha, environment: "rehearsal", databaseId: "11111111-1111-4111-8111-111111111111", migrationRange: { from: "none", to: "none" } };
const evidence = (overrides = {}) => publicEvidence({ run, envelope, pullNumbers: [105], ...overrides });

test("success and all completed failure conclusions publish exact structural identity", () => {
  const report = evidence({ artifactIds: [44] });
  assert.equal(report.verdict, "pass");
  assert.equal(report.commit, sha);
  assert.equal(report.databaseId, envelope.databaseId);
  assert.deepEqual(report.artifactUrls, [`https://github.com/${REPOSITORY}/actions/runs/123/artifacts/44`]);
  for (const conclusion of ["failure", "cancelled", "timed_out", "action_required", "neutral", "skipped", "stale", "startup_failure"]) {
    assert.equal(evidence({ run: { ...run, conclusion } }).verdict, "fail");
  }
});

test("forks, PR events, unknown paths, branches, repositories and incomplete runs fail before publishing", () => {
  for (const patch of [
    { head_repository: { full_name: "attacker/fork" } }, { repository: { full_name: "attacker/repo" } },
    { event: "pull_request" }, { event: "pull_request_target" }, { head_branch: "feature" },
    { path: ".github/workflows/evil.yml" }, { status: "in_progress" }, { head_sha: "malicious" }, { id: -1 },
  ]) assert.throws(() => validatePublicationRun({ ...run, ...patch }));
});

test("production and staging identities are canonical and cannot come from artifacts", () => {
  for (const [environment, event, branch, expected] of [
    ["production", "workflow_dispatch", "main", "b62ccc0a-9c69-4828-9e9b-3bac6ba0e4f1"],
    ["staging", "push", "staging", "fcaf4325-5be7-4ead-ab60-45932a04177b"],
  ]) {
    const report = evidence({ run: { ...run, path: ".github/workflows/cloudflare-pages-deploy.yml", event, head_branch: branch }, envelope: { ...envelope, environment, databaseId: "private arbitrary text" } });
    assert.equal(report.databaseId, expected);
  }
});

test("only exact same-repository merged PR context is routed; missing context blocks success", () => {
  const pull = { number: 105, merged_at: "2026-09-05", merge_commit_sha: sha, base: { ref: "main", repo: { full_name: REPOSITORY } }, head: { repo: { full_name: REPOSITORY } } };
  assert.deepEqual(originatingPulls([pull, pull, { ...pull, number: 106, head: { repo: { full_name: "attacker/fork" } } }, { ...pull, number: 107, merge_commit_sha: "b".repeat(40) }, { ...pull, number: 108, merged_at: null }], run), [105]);
  assert.equal(evidence({ pullNumbers: [] }).originatingPullContext, "unavailable");
  assert.equal(evidence({ pullNumbers: [] }).verdict, "fail");
});

test("missing, malformed, cross-run or future envelope never invents migration or rehearsal UUID", () => {
  for (const value of [null, {}, { ...envelope, commit: "b".repeat(40) }, { ...envelope, runId: 999 }, { ...envelope, attempt: 2 }, { ...envelope, databaseId: "secret" }, { ...envelope, migrationRange: { from: "none", to: "secret" } }]) {
    const report = evidence({ envelope: value });
    assert.equal(report.verdict, "fail");
    assert.equal(report.identityEvidence, "unavailable");
  }
});

test("unknown fields, errors, URLs and migration text never enter the durable summary", () => {
  const secret = "PRIVATE_customer_token";
  const report = evidence({ envelope: { ...envelope, error: secret, summary: secret, runUrl: `https://evil.test/${secret}`, databaseName: secret, issue: 500, migrationRange: { from: `0025_${secret}.sql`, to: "none" } }, artifactIds: [1, -1, "https://evil.test"] });
  const text = renderPublication(report);
  assert.ok(!text.includes(secret));
  assert.ok(!text.includes("evil.test"));
  assert.equal(report.artifactUrls.length, 1);
  assert.equal(report.verdict, "fail");
  assert.equal(evidence({ envelope: { ...envelope, migrationRange: { from: "0025_add_table.sql", to: "0025_add_table.sql" } } }).verdict, "fail");
  assert.equal(evidence({ envelope: { ...envelope, migrationRange: { from: "0025_add_table.sql", to: "0025_add_table.sql" } }, migrationNames: ["0025_add_table.sql"] }).verdict, "pass");
});

test("reruns reuse same-run identity and update the one bot comment, ignoring attacker markers", async () => {
  const comments = [{ id: 1, user: { login: "attacker", type: "User" }, body: renderPublication(evidence()) }];
  let created = 0; let updated = 0;
  const api = {
    listComments: async () => comments,
    createComment: async (_number, body) => { created++; comments.push({ id: 2, user: { login: "github-actions[bot]", type: "Bot" }, body }); },
    updateComment: async (id, body) => { updated++; comments.find((comment) => comment.id === id).body = body; },
  };
  await upsertPublication({ api, issueNumber: 105, report: evidence({ run: { ...run, conclusion: "failure" } }) });
  const rerun = evidence({ run: { ...run, run_attempt: 2 } });
  assert.equal(rerun.verdict, "pass");
  await upsertPublication({ api, issueNumber: 105, report: rerun });
  assert.equal(created, 1); assert.equal(updated, 1);
  assert.match(comments[1].body, /attempt: 2/);
  assert.match(comments[1].body, /evidence — PASS/);
});

test("duplicate bot comments fail closed rather than creating more", async () => {
  const comment = { id: 1, user: { login: "github-actions[bot]", type: "Bot" }, body: renderPublication(evidence()) };
  await assert.rejects(upsertPublication({ api: { listComments: async () => [comment, { ...comment, id: 2 }] }, issueNumber: 91, report: evidence() }), /Duplicate/);
});

test("publisher uses immutable actions, isolated permissions and trusted publisher checkout only", () => {
  const workflow = readFileSync(new URL("../../.github/workflows/data-evidence-publication.yml", import.meta.url), "utf8");
  assert.match(workflow, /types: \[completed\]/);
  assert.match(workflow, /permissions: \{\}/);
  assert.match(workflow, /issues: write/);
  assert.match(workflow, /pull-requests: read/);
  assert.match(workflow, /ref: \$\{\{ github.sha \}\}/);
  assert.match(workflow, /persist-credentials: false/);
  assert.ok(!/pnpm install|npm install|pull_request_target|secrets\./.test(workflow));
  for (const match of workflow.matchAll(/uses: ([^\s]+)/g)) assert.match(match[1], /@[0-9a-f]{40}$/);
  for (const file of ["cloudflare-pages-deploy.yml", "data-migration-rehearsal.yml"]) {
    const source = readFileSync(new URL(`../../.github/workflows/${file}`, import.meta.url), "utf8");
    assert.match(source, /name: Prepare privacy-safe publication identity\n        if: always\(\)/);
    assert.match(source, /publication-evidence-\$\{\{ github.run_id \}\}-\$\{\{ github.run_attempt \}\}/);
    assert.ok(!/issues: write|pull-requests: write/.test(source));
  }
});

test("committed JSON and human examples match the publication renderer", () => {
  const fixture = (name) => readFileSync(new URL(`./fixtures/publication-evidence/${name}`, import.meta.url), "utf8");
  assert.equal(renderPublication(JSON.parse(fixture("publication.json"))), fixture("publication.txt"));
  assert.match(fixture("publication.junit.xml"), /failures="1"/);
});

test("publisher CLI mocks success, failure, missing context, artifact failures and fork without live publication", () => {
  const directory = mkdtempSync(join(tmpdir(), "publication-test-"));
  const cli = new URL("./publish-workflow-evidence.mjs", import.meta.url).href;
  try {
    const envelopePath = join(directory, "publication.json");
    writeFileSync(envelopePath, JSON.stringify(envelope));
    const archive = execFileSync("zip", ["-j", "-", envelopePath]).toString("base64");
    for (const scenario of ["success", "failure", "missing-pr", "missing-artifact", "bad-archive-host", "fork"]) {
      const actualRun = { ...run, conclusion: scenario === "failure" ? "failure" : "success", ...(scenario === "fork" ? { head_repository: { full_name: "evil/fork" } } : {}) };
      const eventPath = join(directory, "event.json");
      writeFileSync(eventPath, JSON.stringify({ workflow_run: actualRun }));
      const program = `
        const run = ${JSON.stringify(actualRun)};
        const scenario = ${JSON.stringify(scenario)};
        const writes = [];
        globalThis.fetch = async (url, options = {}) => {
          url = String(url);
          if (url.includes('blob.core.windows.net')) {
            if (options.headers?.Authorization) throw new Error('token exposure');
            return new Response(Buffer.from(${JSON.stringify(archive)}, 'base64'));
          }
          if (url.endsWith('/zip')) return new Response(null, {status:302,headers:{location: scenario === 'bad-archive-host' ? 'https://evil.test/file' : 'https://sample.blob.core.windows.net/file'}});
          let data;
          if (options.method) { writes.push({url, method:options.method, body:JSON.parse(options.body).body}); data = {id:9}; }
          else if (url.includes('/artifacts?')) data = {artifacts: scenario === 'missing-artifact' ? [] : [{id:55,name:'publication-evidence-123-1',size_in_bytes:1024,expired:false}]};
          else if (url.includes('/pulls?')) data = scenario === 'missing-pr' ? [] : [{number:105,merged_at:'2026-09-05',merge_commit_sha:run.head_sha,base:{ref:'main',repo:{full_name:'serpcompany/serplists.com'}},head:{repo:{full_name:'serpcompany/serplists.com'}}}];
          else if (url.includes('/contents/')) data = [];
          else if (url.includes('/comments?')) data = [];
          else if (url.endsWith('/actions/runs/123')) data = run;
          else throw new Error('unexpected API route');
          return Response.json(data);
        };
        await import(${JSON.stringify(cli)});
        console.log(JSON.stringify(writes));
      `;
      const child = spawnSync(process.execPath, ["--input-type=module", "-e", program], { cwd: directory, encoding: "utf8", env: { ...process.env, GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "workflow_run", GITHUB_REPOSITORY: REPOSITORY, GITHUB_EVENT_PATH: eventPath, GH_TOKEN: "test-token-only" } });
      const writes = JSON.parse(child.stdout.trim());
      assert.equal(child.status, ["success", "failure"].includes(scenario) ? 0 : 1, child.stderr);
      assert.equal(writes.length, scenario === "fork" ? 0 : scenario === "missing-pr" ? 1 : 2);
      if (writes.length) {
        assert.ok(writes.some((write) => write.url.endsWith("/issues/91/comments")));
        assert.match(writes[0].body, scenario === "success" ? /evidence — PASS/ : /evidence — FAIL/);
        assert.ok(!writes[0].body.includes("test-token-only"));
        const saved = JSON.parse(readFileSync(join(directory, "tmp/publication-report/publication.json"), "utf8"));
        assert.equal(saved.verdict, scenario === "success" ? "pass" : "fail");
      }
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
