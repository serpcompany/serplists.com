import { checkNames, failureReport, runChecks, selectRun } from "./checks";
import { root } from "./files";

const USAGE_ERROR = 2;

const [requested, ...paths] = process.argv.slice(2);
const names = requested ? requested.split(",").filter(Boolean) : checkNames;
const unknown = names.filter((name) => !checkNames.includes(name));
if (unknown.length > 0 || names.length === 0) {
  console.error(`Unknown check ${unknown.join(", ") || requested}. Run any of: ${checkNames.join(", ")}, comma-separated, then any paths.`);
  process.exit(USAGE_ERROR);
}

const run = selectRun(paths);
if (paths.length > 0 && run.files.length === 0) {
  console.error(`No repository file is under ${paths.join(", ")}. Name paths relative to the repository root (${root}).`);
  process.exit(USAGE_ERROR);
}

const outcomes = await runChecks(names, run);
const report = failureReport(outcomes);
if (report) console.log(report);
console.log(`\n${outcomes.map((each) => `${each.name} ${each.passed ? "passed" : "failed"}`).join(", ")} (${root})`);
process.exit(outcomes.every((each) => each.passed) ? 0 : 1);
