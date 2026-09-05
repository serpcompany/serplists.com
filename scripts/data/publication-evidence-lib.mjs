export const REPOSITORY = "serpcompany/serplists.com";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const FIXED_DATABASES = { production: "b62ccc0a-9c69-4828-9e9b-3bac6ba0e4f1", staging: "fcaf4325-5be7-4ead-ab60-45932a04177b" };
const positive = (value) => Number.isSafeInteger(value) && value > 0;
const fail = () => { throw new Error("Evidence publication context rejected."); };

// Only GitHub's API run identity determines routing, commit, environment and verdict.
// Artifact contents never select a repository, PR, URL, verdict, or comment body.
export function validatePublicationRun(run) {
  if (run.repository?.full_name !== REPOSITORY || run.head_repository?.full_name !== REPOSITORY ||
      !positive(run.id) || !positive(run.run_attempt) || !/^[0-9a-f]{40}$/.test(run.head_sha ?? "") ||
      run.status !== "completed" || !["success", "failure", "cancelled", "timed_out", "action_required", "neutral", "skipped", "stale", "startup_failure"].includes(run.conclusion)) fail();
  if (run.path === ".github/workflows/data-migration-rehearsal.yml" && run.event === "workflow_dispatch" && run.head_branch === "main") return "rehearsal";
  if (run.path === ".github/workflows/cloudflare-pages-deploy.yml") {
    if (run.event === "workflow_dispatch" && run.head_branch === "main") return "production";
    if (run.event === "push" && run.head_branch === "staging") return "staging";
  }
  return fail();
}

export function originatingPulls(pulls, run) {
  return [...new Set(pulls.filter((pull) => positive(pull.number) && pull.merged_at &&
    pull.merge_commit_sha === run.head_sha && pull.base?.ref === run.head_branch &&
    pull.base?.repo?.full_name === REPOSITORY && pull.head?.repo?.full_name === REPOSITORY)
    .map((pull) => pull.number))].sort((a, b) => a - b);
}

export function publicEvidence({ run, envelope, migrationNames = [], artifactIds = [], pullNumbers = [] }) {
  const environment = validatePublicationRun(run);
  // A rerun of only failed jobs may reuse the immutable identity from the same
  // run's earlier successful job. It never reuses another run or commit.
  const bound = envelope?.commit === run.head_sha && envelope?.runId === run.id && positive(envelope?.attempt) && envelope.attempt <= run.run_attempt && envelope?.environment === environment;
  const validMigration = (value) => value === "none" || (typeof value === "string" && /^\d{4}_[a-z0-9_]+\.sql$/.test(value) && migrationNames.includes(value));
  const from = bound && validMigration(envelope.migrationRange?.from) ? envelope.migrationRange.from : "unavailable";
  const to = bound && validMigration(envelope.migrationRange?.to) ? envelope.migrationRange.to : "unavailable";
  const databaseId = FIXED_DATABASES[environment] ?? (bound && UUID.test(envelope.databaseId ?? "") && !Object.values(FIXED_DATABASES).includes(envelope.databaseId) ? envelope.databaseId : "unavailable");
  const complete = bound && databaseId !== "unavailable" && from !== "unavailable" && to !== "unavailable" && ((from === "none") === (to === "none"));
  const base = `https://github.com/${REPOSITORY}/actions/runs/${run.id}`;
  return {
    schemaVersion: 1, runId: run.id, attempt: run.run_attempt, commit: run.head_sha, environment, databaseId,
    migrationRange: { from: complete ? from : "unavailable", to: complete ? to : "unavailable" },
    verdict: run.conclusion === "success" && complete && pullNumbers.length ? "pass" : "fail",
    workflowConclusion: run.conclusion, identityEvidence: complete ? "complete" : "unavailable",
    originatingPullContext: pullNumbers.length ? "resolved" : "unavailable",
    runUrl: `${base}/attempts/${run.run_attempt}`,
    artifactsUrl: base,
    artifactUrls: [...new Set(artifactIds.filter(positive))].map((id) => `${base}/artifacts/${id}`),
  };
}

export function publicationMarker(runId) {
  if (!positive(runId)) fail();
  return `<!-- data-promotion-evidence:${runId} -->`;
}

export function renderPublication(report) {
  return `${publicationMarker(report.runId)}\nDatabase workflow evidence — ${report.verdict.toUpperCase()}\n\n` +
    `Commit: \`${report.commit}\`\nEnvironment: ${report.environment}\nDatabase UUID: \`${report.databaseId}\`\n` +
    `Migration range: \`${report.migrationRange.from}\` → \`${report.migrationRange.to}\`\n` +
    `Workflow conclusion: ${report.workflowConclusion}; attempt: ${report.attempt}.\n` +
    `Identity evidence: ${report.identityEvidence}; originating PR context: ${report.originatingPullContext}.\n\n` +
    `[Workflow attempt](${report.runUrl}) · [Retained artifacts](${report.artifactsUrl})\n` +
    report.artifactUrls.map((url, index) => `[Evidence artifact ${index + 1}](${url})`).join(" · ") +
    "\n\nReports are retained for at least 90 days. This summary remains after artifact expiry. Missing evidence is a blocking result. This publication does not authorize production.\n";
}

export async function upsertPublication({ api, issueNumber, report }) {
  const marker = publicationMarker(report.runId);
  const comments = await api.listComments(issueNumber);
  const matching = comments.filter((comment) => comment.user?.login === "github-actions[bot]" && comment.user?.type === "Bot" && comment.body?.startsWith(`${marker}\n`));
  if (matching.length > 1) throw new Error("Duplicate evidence comments require reconciliation.");
  const body = renderPublication(report);
  if (matching.length) {
    if (!positive(matching[0].id)) fail();
    await api.updateComment(matching[0].id, body);
  } else await api.createComment(issueNumber, body);
}
