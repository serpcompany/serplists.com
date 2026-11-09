import { randomUUID } from "node:crypto";

const TYPES = ["feat", "fix", "perf", "refactor", "docs", "test", "build", "ci", "chore"];
const CONVENTIONAL_TITLE = new RegExp(`^(?:${TYPES.join("|")})(?:\\([a-z0-9][a-z0-9-]*\\))?!?: \\S`);
const FIX_TITLE = /^fix(?:\([^)]*\))?!?:/i;
const CLOSES_LINE = /^closes #(\d+)$/i;
const NO_ISSUE_LINE = /^no issue: *\S/i;
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/;
const PROMOTION_BRANCH = "promote/";
const PRODUCTION_BRANCH = "main";
const WHERE = "docs/agents/ci.md, Pull request";

const BASE_RULE =
  `Production deploys only files Staging has deployed and checked, so a change, a hotfix included, reaches ${PRODUCTION_BRANCH} ` +
  `only in a promotion (${WHERE}). Open this pull request into staging instead; once Staging's deploy of it passes, ` +
  `pnpm run promote:prepare prepares the promotion into ${PRODUCTION_BRANCH} from a ${PROMOTION_BRANCH} branch.`;

const TITLE_RULE =
  `A pull request's title is a Conventional Commit that names the outcome a user notices, such as ` +
  `"fix: Escape closes the Settings window" (${WHERE}). Start it with one of ${TYPES.join(", ")}, then an optional ` +
  "scope in brackets, an optional !, a colon and a space.";

const ISSUE_RULE =
  "A pull request closes the issue it finishes, so an open issue always means work is left " +
  `(${WHERE}). Start the body with Closes #<number>, one line per issue, or say why there is none on its first line: ` +
  'No issue: <reason>. "Part of #N" and "Refs #N" close nothing.';

const FIX_RULE =
  "A pull request from a fix/ branch, or titled fix:, fixes a bug, so it adds or changes the test that fails without " +
  `the fix: a file under tests/, or a *.test.* or *.spec.* file (${WHERE}). If nothing can fail without this change ` +
  "(a typo, a workflow setting), it isn't a fix: give it another type, such as chore or docs.";

const EVIDENCE_LEVELS = ["Build", "Automated tests", "UI tests", "Installed or deployed artifact", "Owner acceptance"];
const EVIDENCE_HEADING = /^##\s+evidence$/i;
const EVIDENCE_LINE = /^(?:[-*]\s*)?([^:]+):\s*\S/;

const EVIDENCE_RULE =
  `A pull request reports its evidence by level, each on its own line under ## Evidence: ${EVIDENCE_LEVELS.join(", ")} ` +
  `(${WHERE}). A lower level never proves a higher one, and a level that doesn't apply says so, such as ` +
  '"UI tests: none, no screen changed". Link logs; don\'t paste them.';

const passes = (message) => ({ passed: true, message });

const fails = (problem, message = problem) => ({ passed: false, problem, message });

const isTest = (path) => path.startsWith("tests/") || TEST_FILE.test(path);

const isPromotion = (env) =>
  env.PR_BASE === PRODUCTION_BRANCH && (env.PR_BRANCH ?? "").startsWith(PROMOTION_BRANCH) && env.PR_HEAD_REPOSITORY === env.GITHUB_REPOSITORY;

const listed = (paths) => paths.map((path) => `- ${path}`).join("\n");

async function get(path) {
  const api = `${process.env.GITHUB_API_URL || "https://api.github.com"}/repos/${process.env.GITHUB_REPOSITORY}`;
  const response = await fetch(`${api}${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  return { status: response.status, body: response.ok ? await response.json() : null };
}

function base(env) {
  const into = env.PR_BASE ?? "";
  if (into === "") return fails("PR_BASE, the branch the pull request merges into, is not set.");
  if (into !== PRODUCTION_BRANCH) return passes(`Into ${into}, which any branch may merge into.`);
  if (isPromotion(env)) return passes(`A promotion into ${PRODUCTION_BRANCH} from this repository's ${env.PR_BRANCH}.`);
  return fails(
    `A pull request into ${PRODUCTION_BRANCH} is not a promotion.`,
    `A pull request into ${PRODUCTION_BRANCH} from ${env.PR_BRANCH ?? ""} is not a promotion.\n\n${BASE_RULE}`,
  );
}

function title(env) {
  const text = env.PR_TITLE ?? "";
  if (CONVENTIONAL_TITLE.test(text)) return passes(`"${text}" names its type.`);
  return fails("The title is not a Conventional Commit.", `"${text}" is not a Conventional Commit.\n\n${TITLE_RULE}`);
}

function closingLines(body) {
  const lines = body.split(/\r?\n/).map((line) => line.trim());
  const first = lines.findIndex((line) => line !== "");
  const issues = [];
  for (const line of first === -1 ? [] : lines.slice(first)) {
    const closes = CLOSES_LINE.exec(line);
    if (closes) issues.push(Number(closes[1]));
    else if (line !== "") break;
  }
  return { firstLine: first === -1 ? "" : lines[first], issues: [...new Set(issues)] };
}

async function whyItCannotClose(number) {
  const { status, body } = await get(`/issues/${number}`);
  if (status === 200) return body.pull_request ? `#${number} is a pull request, not an issue.` : null;
  if (status === 404 || status === 410) return `#${number} is not an issue in ${process.env.GITHUB_REPOSITORY}.`;
  return `GitHub answered ${status} when asked for issue #${number}.`;
}

async function issueLink(env) {
  if (isPromotion(env)) return passes("A promotion closes the issues its pull requests closed, so it needs no line of its own.");
  const { firstLine, issues } = closingLines(env.PR_BODY ?? "");
  if (NO_ISSUE_LINE.test(firstLine)) return passes(firstLine);
  if (issues.length === 0) {
    const found = firstLine ? `The body starts with "${firstLine}".` : "The body is empty.";
    return fails("The body starts with neither Closes #<number> nor No issue: <reason>.", `${found}\n\n${ISSUE_RULE}`);
  }
  const problems = [];
  for (const number of issues) {
    const problem = await whyItCannotClose(number);
    if (problem) problems.push(problem);
  }
  if (problems.length > 0) {
    return fails("A number the body closes is not an issue GitHub shows in this repository.", `${problems.join("\n")}\n\n${ISSUE_RULE}`);
  }
  return passes(issues.map((number) => `Closes #${number}`).join("\n"));
}

async function changedFiles(number) {
  const files = [];
  for (let page = 1; page <= 30; page += 1) {
    const { status, body } = await get(`/pulls/${number}/files?per_page=100&page=${page}`);
    if (status !== 200 || !Array.isArray(body)) throw new Error(`GitHub answered ${status} when asked for the files of #${number}.`);
    files.push(...body.filter((file) => file.status !== "removed").map((file) => file.filename));
    if (body.length < 100) break;
  }
  return files;
}

async function fixTest(env) {
  const branch = env.PR_BRANCH ?? "";
  if (!branch.startsWith("fix/") && !FIX_TITLE.test(env.PR_TITLE ?? "")) return passes("Not a fix.");
  const changed = await changedFiles(env.PR_NUMBER ?? "");
  const tests = changed.filter(isTest);
  if (tests.length > 0) return passes(`Changes a test:\n${listed(tests)}`);
  return fails("A fix changes no test.", `Changes no test:\n${listed(changed)}\n\n${FIX_RULE}`);
}

function evidence(env) {
  if (isPromotion(env)) return passes("A promotion's evidence is Staging's deploy of the same files, which the Production deploy checks.");
  const lines = (env.PR_BODY ?? "").split(/\r?\n/).map((line) => line.trim());
  const heading = lines.findIndex((line) => EVIDENCE_HEADING.test(line));
  const noSection = 'The body has no "## Evidence" section.';
  if (heading === -1) return fails(noSection, `${noSection}\n\n${EVIDENCE_RULE}`);
  const after = lines.slice(heading + 1);
  const next = after.findIndex((line) => line.startsWith("## "));
  const section = next === -1 ? after : after.slice(0, next);
  const reported = new Set(section.map((line) => EVIDENCE_LINE.exec(line)?.[1]?.trim().toLowerCase()));
  const silent = EVIDENCE_LEVELS.filter((level) => !reported.has(level.toLowerCase()));
  const unreported = `The evidence says nothing for: ${silent.join(", ")}.`;
  if (silent.length > 0) return fails(unreported, `${unreported}\n\n${EVIDENCE_RULE}`);
  return passes("The evidence reports every level.");
}

const CHECKS = new Map([
  ["base", base],
  ["title", title],
  ["issue-link", issueLink],
  ["fix-test", fixTest],
  ["evidence", evidence],
]);

async function run(name, env) {
  const check = CHECKS.get(name ?? "");
  if (!check) return fails("Run it as: node tools/checks/pull-request.mjs base, title, issue-link, fix-test or evidence.");
  try {
    return await check(env);
  } catch (error) {
    return fails(`The ${name} check couldn't finish.`, error instanceof Error ? error.message : String(error));
  }
}

const { passed, problem, message } = await run(process.argv[2], process.env);
const resumeToken = randomUUID();
const withCommandsStopped = `::stop-commands::${resumeToken}\n${message}\n::${resumeToken}::`;
console.log(passed ? withCommandsStopped : `::error::${problem}\n${withCommandsStopped}`);
process.exit(passed ? 0 : 1);
