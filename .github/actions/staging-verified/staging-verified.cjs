const { get, fail, failWhenItThrows } = require("../github-api.cjs");

const resultOf = (job) => (job.status === "completed" ? job.conclusion : job.status);

async function main() {
  const { WORKFLOW: workflow, JOB: job, BRANCH: branch, GITHUB_SHA: sha } = process.env;
  if (!workflow || !job || !branch || !sha) throw new Error("WORKFLOW, JOB, BRANCH and GITHUB_SHA must be set.");
  const tree = (await get(`/git/commits/${sha}`)).tree?.sha;
  if (typeof tree !== "string") throw new Error(`GitHub named no tree for commit ${sha}`);
  const runs = (await get(`/actions/workflows/${workflow}/runs?branch=${encodeURIComponent(branch)}&event=push&per_page=100`))
    .workflow_runs;
  if (!Array.isArray(runs)) throw new Error(`GitHub listed no runs of ${workflow}`);
  const sameFiles = runs.filter((run) => run.head_commit?.tree_id === tree);
  if (sameFiles.length === 0) {
    fail(
      "Staging has not deployed these files",
      `No push run of ${workflow} on ${branch}, among its last 100, built tree ${tree}, the files of ${sha.slice(0, 7)}. ` +
        `Production deploys only files Staging has deployed and checked. Merge the change into ${branch} first, then promote it with ` +
        `pnpm run promote:prepare, which gives main exactly ${branch}'s files.`,
    );
  }
  const results = [];
  for (const run of sameFiles) {
    const jobs = (await get(`/actions/runs/${run.id}/jobs?filter=latest&per_page=100`)).jobs;
    if (!Array.isArray(jobs)) throw new Error(`GitHub listed no jobs for run ${run.run_number}`);
    const deploys = jobs.filter((each) => each.name === job);
    if (deploys.some((each) => each.conclusion === "success")) {
      console.log(`Staging deployed and checked these files in run ${run.run_number} (${run.head_sha.slice(0, 7)}): ${run.html_url}`);
      return;
    }
    results.push(`run ${run.run_number}: ${deploys.map(resultOf).join(", ") || "no such job"}`);
  }
  fail(
    "Staging has not passed its deploy of these files",
    `The push runs of ${workflow} on ${branch} that built tree ${tree} have no passing "${job}" job (${results.join("; ")}). ` +
      `Production deploys only files Staging has deployed and checked. Once ${branch}'s deploy of them passes, start this job again.`,
  );
}

failWhenItThrows("Couldn't tell whether Staging deployed these files", main);
