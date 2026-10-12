const { get, post, failWhenItThrows } = require("../github-api.cjs");

const TITLES = new Map([
  ["staging", "Staging deploy failed"],
  ["production", "Production deploy failed"],
]);

async function main() {
  const { ENVIRONMENT: environment, GITHUB_REPOSITORY: repository, GITHUB_RUN_ID: runId, GITHUB_SHA: sha } = process.env;
  const title = TITLES.get(environment ?? "");
  if (!title) throw new Error(`ENVIRONMENT must be staging or production, not "${environment ?? ""}".`);
  if (!repository || !runId || !sha) throw new Error("GITHUB_REPOSITORY, GITHUB_RUN_ID and GITHUB_SHA must be set.");
  const attempt = process.env.GITHUB_RUN_ATTEMPT || "1";
  const run = `${process.env.GITHUB_SERVER_URL || "https://github.com"}/${repository}/actions/runs/${runId}/attempts/${attempt}`;
  const failure = `The ${environment} deploy of ${sha.slice(0, 7)} failed: ${run}`;
  const open = await get("/issues?state=open&labels=bug&per_page=100");
  if (!Array.isArray(open)) throw new Error("GitHub listed no issues");
  const existing = open.find((issue) => issue.title === title && !issue.pull_request);
  if (existing) {
    await post(`/issues/${existing.number}/comments`, { body: failure });
    console.log(`Added the run to #${existing.number}, which is still open: ${existing.html_url}`);
    return;
  }
  const opened = await post("/issues", {
    title,
    labels: ["bug"],
    body: [
      failure,
      "",
      "Open the run and read the step that failed; docs/agents/ci-deploys.md says what each step checks. " +
        "Fix the cause with a pull request into staging.",
      "",
      `While this issue is open, each later failed ${environment} deploy adds its run here. ` +
        `Done when a ${environment} deploy passes again; then close this issue.`,
    ].join("\n"),
  });
  console.log(`Opened #${opened.number}: ${opened.html_url}`);
}

failWhenItThrows("Couldn't report the failed deploy", main);
