import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { checkNames, runChecks, selectRun } from "./checks/checks";
import { knownLongDocs } from "./checks/doc-rules/budgets";
import { isScriptFile, repositoryFiles, root } from "./checks/files";
import { knownDuplicates } from "./checks/known-duplicates";
import { knownLargeFiles, lineCount } from "./checks/sizes";
import { withoutGitRepositoryOverrides } from "./lib/git-env";
import {
  DEBT_FILES,
  docsToReverify,
  filesNearLimit,
  isGardenedDoc,
  lastChangeTimes,
  namedFiles,
  QUALITY_FILE,
  scoresToRegrade,
  summarizeDebt,
  uncheckedBehaviors,
} from "./lib/maintenance-report-lib";
import { renderReport } from "./lib/maintenance-report-render";
import { groupFindings, readFindings } from "./lib/review-findings";

const COLLECTED_FINDINGS = path.join(root, "tmp/review-findings.json");

const git = (...args: string[]) =>
  execFileSync("git", args, { cwd: root, env: withoutGitRepositoryOverrides(), encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

const files = repositoryFiles(root);
const repository = new Set(files);
const times = lastChangeTimes(git("log", "--format=%x00%ct", "--name-only"));
const outcomes = await runChecks(checkNames, selectRun([], root));

process.stdout.write(
  renderReport({
    date: new Date().toISOString().slice(0, 10),
    checks: outcomes.map(({ name, passed, report }) => ({ name, problems: passed ? [] : report })),
    staleDocs: docsToReverify(
      files.filter(isGardenedDoc).map((doc) => ({ doc, references: namedFiles(doc, read(doc), (file) => repository.has(file)) })),
      times,
    ),
    quality: scoresToRegrade(read(QUALITY_FILE), times),
    debt: summarizeDebt(DEBT_FILES.map(read).join("\n")),
    largeFiles: {
      source: "scripts/checks/sizes.ts",
      entries: Object.entries(knownLargeFiles).map(([name, { lines }]) => ({ name, size: lines })),
    },
    longDocs: {
      source: "scripts/checks/doc-rules/budgets.ts",
      entries: Object.entries(knownLongDocs)
        .map(([name, lines]) => ({ name, size: lines }))
        .sort((a, b) => b.size - a.size),
    },
    duplicates: {
      source: "scripts/checks/known-duplicates.ts",
      entries: Object.entries(knownDuplicates).map(([name, { blocks }]) => ({ name, size: blocks })),
    },
    nearLimit: filesNearLimit(
      files.filter(isScriptFile).map((file) => ({ path: file, lines: lineCount(read(file)) })),
      new Set(Object.keys(knownLargeFiles)),
    ),
    unchecked: uncheckedBehaviors(
      files.filter((file) => file.startsWith("docs/product/") && file.endsWith(".md")).map((doc) => ({ doc, text: read(doc) })),
    ),
    reviewFindings: existsSync(COLLECTED_FINDINGS) ? groupFindings(readFindings(JSON.parse(readFileSync(COLLECTED_FINDINGS, "utf8")))) : null,
  }),
);
