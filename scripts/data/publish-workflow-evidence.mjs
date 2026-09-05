#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { REPOSITORY, validatePublicationRun, originatingPulls, publicEvidence, renderPublication, upsertPublication } from "./publication-evidence-lib.mjs";

// No dependency installation, artifact code execution, or source-run checkout.
const root = `https://api.github.com/repos/${REPOSITORY}`;
async function request(path, options = {}) {
  if (!path.startsWith("/") || path.includes("..")) throw new Error("API route rejected.");
  const response = await fetch(root + path, { ...options, redirect: "error", headers: {
    Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28",
    Authorization: `Bearer ${process.env.GH_TOKEN}`, ...(options.body ? { "Content-Type": "application/json" } : {}),
  } });
  if (!response.ok) throw new Error("GitHub evidence API request failed.");
  return response.json();
}
async function pages(path, key) {
  const all = [];
  for (let page = 1; page <= 100; page++) {
    const result = await request(`${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`);
    const items = key ? result[key] : result;
    if (!Array.isArray(items)) throw new Error("GitHub evidence page rejected.");
    all.push(...items);
    if (items.length < 100) return all;
  }
  throw new Error("GitHub evidence pagination limit reached.");
}
async function envelopeFromArtifact(artifact) {
  if (!artifact || artifact.expired || artifact.size_in_bytes > 65536 || !Number.isSafeInteger(artifact.id)) return null;
  const response = await fetch(`${root}/actions/artifacts/${artifact.id}/zip`, { redirect: "manual", headers: {
    Authorization: `Bearer ${process.env.GH_TOKEN}`, Accept: "application/vnd.github+json",
  } });
  if (response.status !== 302) throw new Error("Evidence archive unavailable.");
  const location = new URL(response.headers.get("location"));
  if (location.protocol !== "https:" || location.username || location.password ||
      ![".blob.core.windows.net", ".actions.githubusercontent.com"].some((suffix) => location.hostname.endsWith(suffix))) throw new Error("Evidence archive destination rejected.");
  // Never send the GitHub token to an artifact download host.
  const download = await fetch(location, { redirect: "error" });
  if (!download.ok) throw new Error("Evidence archive unavailable.");
  const chunks = []; let length = 0;
  for await (const chunk of download.body) {
    length += chunk.length;
    if (length > 65536) throw new Error("Evidence archive too large.");
    chunks.push(chunk);
  }
  const directory = mkdtempSync(join(tmpdir(), "publication-evidence-"));
  try {
    const archive = join(directory, "evidence.zip");
    writeFileSync(archive, Buffer.concat(chunks));
    // Read one fixed member to stdout; never extract paths or execute any member.
    const value = execFileSync("unzip", ["-p", archive, "publication.json"], { maxBuffer: 16384, timeout: 5000, stdio: ["ignore", "pipe", "pipe"], env: { PATH: "/usr/bin:/bin" } });
    return JSON.parse(value.toString("utf8"));
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

try {
  if (process.env.GITHUB_ACTIONS !== "true" || process.env.GITHUB_EVENT_NAME !== "workflow_run" || process.env.GITHUB_REPOSITORY !== REPOSITORY) throw new Error("Publisher context rejected.");
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
  validatePublicationRun(event.workflow_run);
  const run = await request(`/actions/runs/${event.workflow_run.id}`);
  validatePublicationRun(run);
  if (run.head_sha !== event.workflow_run.head_sha || run.run_attempt !== event.workflow_run.run_attempt) throw new Error("Stale publication attempt rejected.");
  const pulls = originatingPulls(await pages(`/commits/${run.head_sha}/pulls`), run);
  const artifacts = await pages(`/actions/runs/${run.id}/artifacts`, "artifacts");
  const candidates = artifacts.filter((artifact) => {
    const match = new RegExp(`^publication-evidence-${run.id}-([1-9][0-9]*)$`).exec(artifact.name);
    return match && Number(match[1]) <= run.run_attempt;
  }).sort((a, b) => Number(b.name.split("-").at(-1)) - Number(a.name.split("-").at(-1)));
  let envelope = null;
  if (candidates.length && (candidates.length === 1 || candidates[0].name !== candidates[1].name)) {
    try { envelope = await envelopeFromArtifact(candidates[0]); } catch { /* Publish a generic missing-evidence failure, never exception text. */ }
  }
  const files = await request(`/contents/db/migrations?ref=${run.head_sha}`);
  const migrationNames = Array.isArray(files) ? files.filter((file) => file.type === "file").map((file) => file.name) : [];
  // Link only known report artifacts; never the sanitized data or recovery export.
  const publicArtifacts = artifacts.filter((artifact) => !artifact.expired && /^(?:rehearsal|sanitizer-reports|production-(?:request|data|postdeploy|failure)|staging-(?:data|postdeploy|failure))-[0-9]+$/.test(artifact.name));
  const report = publicEvidence({ run, envelope, migrationNames, artifactIds: publicArtifacts.map((artifact) => artifact.id), pullNumbers: pulls });
  mkdirSync("tmp/publication-report", { recursive: true });
  writeFileSync("tmp/publication-report/publication.json", `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync("tmp/publication-report/publication.txt", renderPublication(report));
  writeFileSync("tmp/publication-report/publication.junit.xml", `<testsuite name="evidence-publication" tests="1" failures="${report.verdict === "pass" ? 0 : 1}"><testcase name="workflow-evidence">${report.verdict === "pass" ? "" : '<failure message="Workflow failed or required evidence is unavailable"/>'}</testcase></testsuite>\n`);
  const api = {
    listComments: (number) => pages(`/issues/${number}/comments`),
    updateComment: (id, body) => request(`/issues/comments/${id}`, { method: "PATCH", body: JSON.stringify({ body }) }),
    createComment: (number, body) => request(`/issues/${number}/comments`, { method: "POST", body: JSON.stringify({ body }) }),
  };
  const latestRun = await request(`/actions/runs/${run.id}`);
  if (latestRun.status !== "completed" || latestRun.run_attempt !== run.run_attempt) throw new Error("Stale publication attempt rejected.");
  // Attempt each target independently, so a failed PR write does not hide the incident evidence.
  const outcomes = await Promise.allSettled([...pulls, 91].map((issueNumber) => upsertPublication({ api, issueNumber, report })));
  if (outcomes.some((outcome) => outcome.status === "rejected") || report.identityEvidence !== "complete" || !pulls.length) throw new Error("Publication incomplete.");
} catch {
  console.error("Evidence publication blocked or incomplete; inspect the workflow context and retained reports.");
  process.exitCode = 1;
}
