import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { filesGitTracksOrWouldTrack, GENERATED_FILES } from "./check-no-comments-lib";
import { staleScoreRows, summarizeDebt } from "./lib/maintenance-report-lib";
import { walkFiles } from "./lib/repo-files";
import { buildScriptInvocation } from "./lib/run-tool";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file: string) => readFileSync(path.join(repoRoot, file), "utf8");
const DAY = 24 * 60 * 60;
const now = Math.floor(Date.now() / 1000);
const MAX_LINES = 500;
const NEAR_LIMIT_LINES = 450;
const STALE_PLAN_DAYS = 30;

function lastCommitTime(file: string): number | null {
  const out = execFileSync("git", ["log", "-1", "--format=%ct", "--", file], { cwd: repoRoot, encoding: "utf8" }).trim();
  return out ? Number(out) : null;
}

const walk = (dir: string, predicate: (file: string) => boolean) => walkFiles(repoRoot, dir, predicate);

const sections: string[] = [];

const checkDocs = buildScriptInvocation("scripts/check-docs.ts");
const docs = spawnSync(checkDocs.command, checkDocs.args, { cwd: repoRoot, encoding: "utf8" });
sections.push(
  "## Docs check",
  docs.status === 0 ? `Passing. ${docs.stdout.trim()}` : `Failing:\n\n\`\`\`text\n${(docs.stderr || docs.stdout).trim()}\n\`\`\``,
);

const docFiles = ["AGENTS.md", "ARCHITECTURE.md", ...walk("docs", (file) => file.endsWith(".md"))];
const staleDocs: { doc: string; changed: string[] }[] = [];
for (const doc of docFiles) {
  const docTime = lastCommitTime(doc);
  if (!docTime) continue;
  const text = read(doc).replace(/^```[\s\S]*?^```/gm, "");
  const refs = [...new Set([...text.matchAll(/`((?:src|functions|scripts|db)\/[^`\s*<>{}]+)`/g)].flatMap((match) => (match[1] === undefined ? [] : [match[1]])))]
    .filter((ref) => existsSync(path.join(repoRoot, ref)));
  const changed = refs.filter((ref) => (lastCommitTime(ref) ?? 0) > docTime);
  if (changed.length > 0) staleDocs.push({ doc, changed });
}
sections.push(
  "## Docs to re-verify",
  "Code these docs reference changed after the doc was last edited. Confirm each doc still matches the code.",
  staleDocs.length === 0
    ? "None."
    : staleDocs.map(({ doc, changed }) => `- \`${doc}\`: ${changed.slice(0, 5).map((ref) => `\`${ref}\``).join(", ")}${changed.length > 5 ? `, +${changed.length - 5} more` : ""}`).join("\n"),
);

const scoreFile = "docs/QUALITY_SCORE.md";
const staleScores = staleScoreRows(read(scoreFile), lastCommitTime, (ref) => existsSync(path.join(repoRoot, ref)));
const dayOf = (seconds: number) => new Date(seconds * 1000).toISOString().slice(0, 10);
sections.push(
  "## Scores to re-grade",
  `Rows of \`${scoreFile}\` whose code changed after the row was graded. Re-grade each one against the code as it is now.`,
  staleScores.length === 0
    ? "None."
    : staleScores.map(({ name, graded, changed }) => `- ${name} (graded ${graded}): ${changed.map(({ ref, time }) => `\`${ref}\` changed ${dayOf(time)}`).join(", ")}`).join("\n"),
);

const debt = summarizeDebt(read("docs/exec-plans/tech-debt-tracker.md"));
sections.push(
  "## Tech debt",
  [
    `- Open items: ${debt.open} (${debt.bySize.small} small, ${debt.bySize.medium} medium, ${debt.bySize.large} large).`,
    `- Oldest small item: ${debt.oldestSmall ?? "none"}.`,
    ...(debt.unsized.length > 0 ? [`- Rows without a Size: ${debt.unsized.join(", ")}; give each one.`] : []),
  ].join("\n"),
);

const AUTHORED_CODE = /\.(js|jsx|mjs|cjs|ts|tsx|mts|cts)$/;
const nearLimit = filesGitTracksOrWouldTrack()
  .filter((file) => AUTHORED_CODE.test(file) && !GENERATED_FILES.includes(file) && existsSync(path.join(repoRoot, file)))
  .map((file) => ({ file, lines: read(file).split("\n").length }))
  .filter(({ lines }) => lines >= NEAR_LIMIT_LINES)
  .sort((a, b) => b.lines - a.lines);
sections.push(
  "## Files near the size limit",
  `${nearLimit.length} files have ${NEAR_LIMIT_LINES} lines or more. ESLint \`max-lines\` stops every authored JavaScript and TypeScript file at ${MAX_LINES}, with no exceptions: split one of these by responsibility before a change has to.`,
  nearLimit.length === 0 ? "None." : nearLimit.map(({ file, lines }) => `- \`${file}\`: ${lines}`).join("\n"),
);

const activePlans = walk("docs/exec-plans/active", (file) => file.endsWith(".md")).map((file) => {
  const updated = read(file).match(/\*\*Last updated:\*\*\s*(\d{4}-\d{2}-\d{2})/)?.[1];
  const age = updated ? Math.floor((now - Date.parse(updated) / 1000) / DAY) : null;
  return { file, updated, age };
});
const graded = read("docs/QUALITY_SCORE.md").match(/\*\*Last graded:\*\*\s*(\d{4}-\d{2}-\d{2})/)?.[1] ?? "unknown";
const STALE_DESIGN_DOC_DAYS = 90;
const staleDesignDocs = read("docs/design-docs/index.md").split("\n")
  .map((line) => line.split("|").map((cell) => cell.trim()))
  .filter((cells) => /^\d{4}-\d{2}-\d{2}$/.test(cells[3] ?? "") && cells[2] !== "historical")
  .map((cells) => ({ doc: cells[1], age: Math.floor((now - Date.parse(cells[3] ?? "") / 1000) / DAY) }))
  .filter(({ age }) => age > STALE_DESIGN_DOC_DAYS);
sections.push(
  "## Plans and scores",
  [
    ...(activePlans.length === 0 ? ["- No active plans."] : []),
    ...activePlans.map(({ file, updated, age }) =>
      `- \`${file}\`: last updated ${updated ?? "unknown"}${age !== null && age > STALE_PLAN_DAYS ? ` (**${age} days; update or close it**)` : ""}`),
    `- Quality score last graded: ${graded}`,
    ...staleDesignDocs.map(({ doc, age }) => `- Design doc ${doc} last verified ${age} days ago; re-verify it against the code`),
  ].join("\n"),
);

sections.push(
  "## This week's checklist",
  [
    "- [ ] Fix any docs-check failures and re-verify the docs listed above against the code.",
    "- [ ] Pay down one tech debt item, or split one file near the size limit, in a small PR (the code gardener takes the oldest small item).",
    "- [ ] Update or close stale active plans; move finished plans to `docs/exec-plans/completed/`.",
    "- [ ] Re-grade `docs/QUALITY_SCORE.md` if the code in a domain changed materially.",
    "- [ ] If a new failure pattern appeared in recent PRs, add it to `docs/design-docs/core-beliefs.md` and, where possible, a lint or check.",
  ].join("\n"),
  "See [agent workflow](docs/design-docs/agent-workflow.md#weekly-maintenance) for how to work this issue.",
);

console.log(`# Repository maintenance report\n\nGenerated ${new Date().toISOString().slice(0, 10)} by \`pnpm run maintenance:report\`.\n\n${sections.join("\n\n")}\n`);
