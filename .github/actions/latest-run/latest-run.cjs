const { get, fail, failWhenItThrows } = require("../github-api.cjs");

const WAITING = new Set(["queued", "pending", "requested"]);

const ran = (job) =>
  job.status === "in_progress" ||
  (job.status === "completed" &&
    job.conclusion !== "skipped" &&
    !(job.conclusion === "cancelled" && !(job.steps || []).length));

async function main() {
  const { WORKFLOW: workflow, JOB: job, GITHUB_REF_NAME: branch, GITHUB_RUN_NUMBER: runNumber } = process.env;
  if (!workflow || !job || !branch || !/^\d+$/.test(runNumber ?? "")) {
    throw new Error("WORKFLOW, JOB, GITHUB_REF_NAME and GITHUB_RUN_NUMBER must be set.");
  }
  const mine = Number(runNumber);
  const runs = (await get(`/actions/workflows/${workflow}/runs?branch=${encodeURIComponent(branch)}&per_page=30`)).workflow_runs;
  if (!Array.isArray(runs)) throw new Error(`GitHub listed no runs of ${workflow}`);
  const later = runs.filter(
    (run) => run.event !== "pull_request" && run.run_number > mine && !(WAITING.has(run.status) && run.run_attempt === 1),
  );
  for (const run of later) {
    const jobs = (await get(`/actions/runs/${run.id}/jobs?filter=all&per_page=100`)).jobs;
    if (!Array.isArray(jobs)) throw new Error(`GitHub listed no jobs for run ${run.run_number}`);
    if (jobs.some((each) => each.name === job && ran(each))) {
      fail(
        "A later run has already run this job",
        `This is run ${mine} of ${workflow}, and run ${run.run_number} on ${branch}, which is later, has already run its "${job}" job. ` +
          "So this one deploys nothing: it would put old code over new. To deploy an old commit on purpose, revert to it in a new pull request.",
      );
    }
  }
}

failWhenItThrows("Couldn't tell whether a later run exists", main);
