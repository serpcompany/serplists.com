import { lineLimit } from "../checks/sizes";
import {
  DEBT_FILES,
  type DebtItem,
  type DebtSummary,
  NEAR_LIMIT_LINES,
  QUALITY_FILE,
  type QualityRows,
  type SizedFile,
  type StaleDoc,
  type UncheckedBehaviors,
} from "./maintenance-report-lib";
import { type FindingGroup, isRepeated, REPEATED } from "./review-findings";

type CheckProblems = { name: string; problems: string[] };
type ExceptionList = { source: string; entries: { name: string; size: number }[] };

export type MaintenanceFacts = {
  date: string;
  checks: CheckProblems[];
  staleDocs: StaleDoc[];
  quality: QualityRows;
  debt: DebtSummary;
  largeFiles: ExceptionList;
  longDocs: ExceptionList;
  duplicates: ExceptionList;
  nearLimit: SizedFile[];
  unchecked: UncheckedBehaviors[];
  reviewFindings: FindingGroup[] | null;
};

export const PROBLEMS_SHOWN_PER_CHECK = 50;
const PROBLEM_LENGTH = 300;

const code = (text: string) => `\`${text}\``;
const shortened = (line: string) => (line.length > PROBLEM_LENGTH ? `${line.slice(0, PROBLEM_LENGTH - 1)}…` : line);
const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

function limited(items: readonly string[], limit: number): string {
  const shown = items.slice(0, limit).join(", ");
  return items.length > limit ? `${shown}, +${items.length - limit} more` : shown;
}

function failure({ name, problems }: CheckProblems): string {
  const command = code(`pnpm run verify ${name}`);
  const shown = problems.slice(0, PROBLEMS_SHOWN_PER_CHECK).map(shortened).join("\n");
  const more = problems.length - PROBLEMS_SHOWN_PER_CHECK;
  const rest = more > 0 ? `\n\n${plural(more, "more line")}: run ${command} for all of them.` : "";
  return `${command} fails:\n\n\`\`\`\`text\n${shown}\n\`\`\`\`${rest}`;
}

function checksSection(checks: readonly CheckProblems[]): string {
  const failing = checks.filter((check) => check.problems.length > 0);
  if (failing.length === 0) return `Passing: ${checks.map((check) => check.name).join(", ")}.`;
  return failing.map(failure).join("\n\n");
}

function scoresSection(quality: QualityRows): string {
  const lines = [
    ...quality.stale.map(
      ({ area, graded, changed }) =>
        `- ${area} (graded ${graded}): ${limited(changed.map(({ path, day }) => `${code(path)} changed ${day}`), 5)}`,
    ),
    ...(quality.ungraded.length > 0 ? [`- Rows without a Graded date, which each need one: ${quality.ungraded.join(", ")}.`] : []),
  ];
  return lines.length > 0 ? lines.join("\n") : "None.";
}

const debtItem = ({ section, debt, issue }: DebtItem) =>
  [section ? `${section}: ${debt}` : debt, issue ? `Issue: ${issue}.` : ""].filter(Boolean).join(" ");

function debtLines(debt: DebtSummary): string[] {
  const { small, medium, large } = debt.bySize;
  return [
    `- ${DEBT_FILES.map(code).join(" and ")}: ${plural(debt.open, "open item")} (${small} small, ${medium} medium, ${large} large).`,
    `- First small item: ${debt.firstSmall ? debtItem(debt.firstSmall) : "none."}`,
    ...(debt.unsized.length > 0
      ? [`- Rows without a Size, which each need one: ${debt.unsized.length}.`, ...debt.unsized.map((item) => `  - ${debtItem(item)}`)]
      : []),
  ];
}

const exceptionLines = (intro: string, list: ExceptionList, entry: (name: string, size: number) => string) => [
  intro,
  ...list.entries.map(({ name, size }) => `  - ${entry(name, size)}`),
];

function knownDebtSection(facts: MaintenanceFacts): string {
  const blocks = facts.duplicates.entries.reduce((total, { size }) => total + size, 0);
  return [
    ...debtLines(facts.debt),
    ...exceptionLines(
      `- Files over the size limit, each with its reason in ${code(facts.largeFiles.source)}: ${facts.largeFiles.entries.length}.`,
      facts.largeFiles,
      (path, lines) => `${code(path)}: ${lines} lines`,
    ),
    ...exceptionLines(
      `- Docs over their size budget, each with its allowance in ${code(facts.longDocs.source)}: ${facts.longDocs.entries.length}. Split one by topic, then lower or remove its allowance.`,
      facts.longDocs,
      (path, lines) => `${code(path)}: ${lines} lines`,
    ),
    ...exceptionLines(
      `- Repeated blocks allowed for now, each pair with its reason in ${code(facts.duplicates.source)}: ${blocks}.`,
      facts.duplicates,
      (pair, count) => `${pair}: ${count}`,
    ),
  ].join("\n");
}

function uncheckedSection(unchecked: readonly UncheckedBehaviors[]): string {
  if (unchecked.length === 0) return "None: every behavior in the product docs names its check.";
  const total = unchecked.reduce((sum, { lines }) => sum + lines.length, 0);
  return [
    `${plural(total, "behavior")} in ${plural(unchecked.length, "doc")}. Write the test, then name it on the behavior's \`- Check:\` line.`,
    unchecked.map(({ doc, lines }) => `- ${code(doc)}: ${lines.length === 1 ? "line" : "lines"} ${lines.join(", ")}`).join("\n"),
  ].join("\n\n");
}

function findingsSection(groups: readonly FindingGroup[] | null): string {
  if (groups === null) {
    return `Not collected: only the ${code("report")} job of ${code("Weekly maintenance")} reads the pull requests' comments.`;
  }
  if (groups.length === 0) return "None in the last four weeks.";
  const line = ({ part, findings, pulls, blocking, examples }: FindingGroup) =>
    `- ${code(part)}: ${findings} in ${plural(pulls, "pull request")}, ${blocking} blocking. ${examples
      .map(({ title, url }) => `[${title}](${url})`)
      .join("; ")}`;
  const patterns = groups.filter(isRepeated);
  const rest = groups.filter((group) => !isRepeated(group));
  return [
    patterns.length > 0 ? `Repeated:\n\n${patterns.map(line).join("\n")}` : "Nothing repeated.",
    ...(rest.length > 0 ? [`Elsewhere:\n\n${rest.map(line).join("\n")}`] : []),
  ].join("\n\n");
}

export function renderReport(facts: MaintenanceFacts): string {
  const sections = [
    "## Checks",
    checksSection(facts.checks),
    "## Docs to re-verify",
    "Files these docs name or link changed after the doc was last edited. Check that each doc still matches them.",
    facts.staleDocs.length > 0
      ? facts.staleDocs.map(({ doc, changed }) => `- ${code(doc)}: ${limited(changed.map(code), 5)}`).join("\n")
      : "None.",
    "## Scores to re-grade",
    `Rows of ${code(QUALITY_FILE)} whose code changed after the day they were graded. Re-grade each against the code as it is now, and set its Graded date.`,
    scoresSection(facts.quality),
    "## Known debt",
    knownDebtSection(facts),
    "## Files near the size limit",
    `${plural(facts.nearLimit.length, "code file")} ${facts.nearLimit.length === 1 ? "has" : "have"} ${NEAR_LIMIT_LINES} lines or more. Every one stops at ${lineLimit}, and only the files listed above may pass it: split one of these by responsibility before a change has to.`,
    facts.nearLimit.length > 0 ? facts.nearLimit.map(({ path, lines }) => `- ${code(path)}: ${lines} lines`).join("\n") : "None.",
    "## Behaviors with no automated check",
    "Behaviors in the product docs whose check line says `No automated check yet`.",
    uncheckedSection(facts.unchecked),
    "## Review findings",
    `What Claude's review commented inline in the last four weeks, by the part of the repository. ${REPEATED.findings} or more in one part, across ${REPEATED.pulls} or more pull requests, is a pattern: write the rule into ${code("docs/agents/code.md")} and, where it can be checked, add the check.`,
    findingsSection(facts.reviewFindings),
    "## This week's checklist",
    [
      "- [ ] Fix any failing check, and re-verify the docs listed above against the code.",
      "- [ ] Re-grade each row listed under Scores to re-grade, and set its Graded date.",
      `- [ ] Pay down one item from ${DEBT_FILES.map(code).join(" or ")}, or split one file near the size limit, in a small pull request.`,
      "- [ ] Write the missing test for one behavior listed under Behaviors with no automated check.",
      `- [ ] For a part listed as repeated under Review findings, add the rule to ${code("docs/agents/code.md")} and, where possible, a check.`,
    ].join("\n"),
    `Work this issue one item per small pull request, as ${code("docs/agents/ci-agents.md")} says under Weekly maintenance.`,
  ];
  return `# Repository maintenance report\n\nGenerated ${facts.date} by ${code("pnpm run maintenance:report")}.\n\n${sections.join("\n\n")}\n`;
}
