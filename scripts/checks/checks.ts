import { findCommentProblems } from "./comments";
import { findDeadCode } from "./deadcode";
import { checkDependencies } from "./dependencies";
import { checkDocs } from "./docs";
import { duplicateFolders, findDuplicates } from "./duplicates";
import { asPrefix, covers, repositoryFiles, root, type Run } from "./files";
import { staleGeneratedFiles } from "./generated";
import { duplicateProblems } from "./known-duplicates";
import { linterReport, runActionlint } from "./linters";
import { located, type Problem } from "./problems";
import {
  commentRule,
  deadCodeRule,
  dependencyRule,
  docsRule,
  duplicateRule,
  generatedRule,
  linterRule,
  secretRule,
  sizeRule,
} from "./rules";
import { findSecrets } from "./secrets";
import { checkSizes } from "./sizes";

export interface Outcome {
  name: string;
  passed: boolean;
  report: string[];
}

type Check = (run: Run) => Outcome | Promise<Outcome>;

const outcome = (name: string, findings: readonly string[], rule: string): Outcome => ({
  name,
  passed: findings.length === 0,
  report: findings.length === 0 ? [] : [...findings, rule],
});

const problemsOutcome = (name: string, problems: readonly Problem[], rule: string) => outcome(name, problems.map(located), rule);

const checks: Record<string, Check> = {
  comments: async ({ root: at, files }) => {
    const problems = await findCommentProblems(at, files);
    const filesWithComments = new Set(problems.map((problem) => problem.path)).size;
    const count = problems.length === 0 ? [] : [`${problems.length} comments in ${filesWithComments} files.`];
    return outcome("comments", [...problems.map(located), ...count], commentRule);
  },
  docs: (run) => problemsOutcome("docs", checkDocs(run), docsRule),
  sizes: (run) => problemsOutcome("sizes", checkSizes(run), sizeRule),
  secrets: async ({ root: at, files }) => outcome("secrets", await findSecrets(at, files), secretRule),
  duplicates: ({ root: at, all, prefixes }) => {
    const folders = duplicateFolders.filter((folder) => all.some((file) => file.startsWith(`${folder}/`)));
    return outcome("duplicates", duplicateProblems(findDuplicates(at, folders), prefixes), duplicateRule);
  },
  deadcode: ({ root: at }) => outcome("deadcode", findDeadCode(at), deadCodeRule),
  dependencies: ({ root: at, prefixes }) => outcome("dependencies", checkDependencies(at, prefixes), dependencyRule),
  linters: ({ root: at, files }) => {
    const { passed, findings } = linterReport(runActionlint(at, files), Boolean(process.env["CI"]));
    return { name: "linters", passed, report: findings.length === 0 ? [] : [...findings, linterRule] };
  },
  generated: ({ root: at }) => outcome("generated", staleGeneratedFiles(at), generatedRule),
};

export const checkNames = Object.keys(checks);

export const perFileChecks = ["comments", "sizes", "secrets"];

export function selectRun(requested: readonly string[], at: string = root): Run {
  const all = repositoryFiles(at);
  const prefixes = requested.map((path) => asPrefix(path, at));
  return { root: at, all, files: all.filter((file) => covers(prefixes, file)), prefixes };
}

export async function runChecks(names: readonly string[], run: Run): Promise<Outcome[]> {
  const outcomes: Outcome[] = [];
  for (const name of names) {
    const check = checks[name];
    if (check) outcomes.push(await check(run));
  }
  return outcomes;
}

export const failureReport = (outcomes: readonly Outcome[]) =>
  outcomes
    .filter((each) => each.report.length > 0)
    .map((each) => `\n${each.name}\n${each.report.join("\n")}`)
    .join("\n");
