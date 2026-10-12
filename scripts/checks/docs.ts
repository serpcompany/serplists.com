import { readFileSync } from "node:fs";
import path, { posix } from "node:path";

import { findComments } from "../check-no-comments-lib";
import { anchorOf, headingAnchors } from "./doc-rules/anchors";
import { budgetProblem, knownLongDocs, staleAllowances } from "./doc-rules/budgets";
import { decisionNamingAdvice, layoutAdvice, misnamed, misnamedDecision, namingAdvice, outOfLayout } from "./doc-rules/layout";
import { codeSpans, fencedCodeLines, type Line, markdownLinks, proseLines, withoutCodeSpans } from "./doc-rules/markdown";
import { exists, missingPath, namedPath, repositoryTree, type Tree } from "./doc-rules/paths";
import { productCheckProblems } from "./doc-rules/product-checks";
import { type KnownCommands, knownCommands, missingScript, pnpmScripts, proseScripts } from "./doc-rules/scripts";
import { foldersWithoutASkill, skillCatalog, skillProblems } from "./doc-rules/skills";
import { type TestTitle, testTitles } from "./doc-rules/test-titles";
import { covers, type Run } from "./files";
import { excerpt, type Problem } from "./problems";

interface Docs {
  tree: Tree;
  text: (doc: string) => string;
  prose: (doc: string) => Line[];
  anchors: (doc: string) => Set<string>;
  commands: KnownCommands;
  titles: (file: string) => readonly TestTitle[];
  allowances: Readonly<Record<string, number>>;
}

const isDoc = (file: string) => file.endsWith(".md") && !file.startsWith("tests/");
const isDecisionRecord = (doc: string) => doc.startsWith("docs/adr/");
const describesAnotherProject = (doc: string) => doc.startsWith("docs/references/");
const isPlaced = (file: string) => file.startsWith("docs/") || (!file.includes("/") && file.endsWith(".md"));
const isExternal = (target: string) => /^[a-z][a-z\d+.-]*:/i.test(target);
const isEntryPoint = (doc: string) =>
  doc === "README.md" ||
  ["AGENTS.md", "CLAUDE.md"].includes(posix.basename(doc)) ||
  doc.startsWith(".claude/") ||
  doc.startsWith(".github/");

function cached<T>(compute: (key: string) => T): (key: string) => T {
  const values = new Map<string, T>();
  return (key) => {
    const known = values.get(key);
    if (known !== undefined) return known;
    const value = compute(key);
    values.set(key, value);
    return value;
  };
}

function resolveLink(from: string, target: string): string {
  const withoutAnchor = target.replace(/[#?].*$/, "");
  let decoded = withoutAnchor;
  try {
    decoded = decodeURIComponent(withoutAnchor);
  } catch {
    decoded = withoutAnchor;
  }
  const joined = decoded.startsWith("/") ? decoded.slice(1) : posix.join(posix.dirname(from), decoded);
  return posix.normalize(joined).replace(/\/$/, "");
}

const markdownIn = (tree: Tree, folder: string) =>
  [...tree.files].filter((file) => file.endsWith(".md") && posix.dirname(file) === posix.normalize(folder || "."));

function linkProblems(doc: string, docs: Docs, linked: string[]): Problem[] {
  const problems: Problem[] = [];
  for (const { line, target } of markdownLinks(docs.prose(doc))) {
    const anchor = anchorOf(target);
    if (target.startsWith("#")) {
      if (anchor && !docs.anchors(doc).has(anchor)) problems.push({ path: doc, line, problem: `links to ${target}, a heading this doc doesn't have` });
      continue;
    }
    if (isExternal(target)) continue;
    const resolved = resolveLink(doc, target);
    if (!exists(docs.tree, resolved)) {
      problems.push({ path: doc, line, problem: `links to ${target}, which doesn't exist in the repository` });
      continue;
    }
    if (anchor && resolved.endsWith(".md") && docs.tree.files.has(resolved) && !docs.anchors(resolved).has(anchor)) {
      problems.push({ path: doc, line, problem: `links to ${target}, a heading ${resolved} doesn't have` });
    }
    linked.push(...(docs.tree.folders.has(resolved) ? markdownIn(docs.tree, resolved) : [resolved]));
  }
  return problems;
}

function codeProblems(doc: string, docs: Docs): Problem[] {
  if (describesAnotherProject(doc)) return [];
  const problems: Problem[] = [];
  const spans = docs.prose(doc).flatMap(({ line, text }) => codeSpans(text).map((code) => ({ line, code })));
  if (!isDecisionRecord(doc)) {
    for (const { line, code } of spans) {
      const named = namedPath(code, docs.tree);
      if (named && missingPath(doc, named, docs.tree)) problems.push({ path: doc, line, problem: `names ${named}, which isn't in the repository (a gitignored path counts as missing)` });
    }
  }
  const commands = [
    ...spans.flatMap(({ line, code }) => pnpmScripts(code).map((script) => ({ line, script }))),
    ...fencedCodeLines(docs.text(doc)).flatMap(({ line, text }) => pnpmScripts(text).map((script) => ({ line, script }))),
    ...docs.prose(doc).flatMap(({ line, text }) => proseScripts(withoutCodeSpans(text)).map((script) => ({ line, script }))),
  ];
  for (const { line, script } of commands) {
    if (missingScript(script, docs.commands)) problems.push({ path: doc, line, problem: `runs pnpm ${script}, which package.json doesn't define` });
  }
  return problems;
}

function contentProblems(doc: string, docs: Docs): Problem[] {
  const text = docs.text(doc);
  const problems: Problem[] = findComments(doc, text).map(({ line }) => ({
    path: doc,
    line,
    problem: `hides ${excerpt(text.split(/\r?\n/)[line - 1] ?? "")} in an HTML comment, which people reading the rendered doc never see though agents do: say it in the doc, or delete it`,
  }));
  const overBudget = budgetProblem(doc, text, docs.allowances);
  if (overBudget) problems.push({ path: doc, problem: overBudget });
  if (doc.startsWith("docs/product/")) {
    const context = { isRepositoryFile: (file: string) => docs.tree.files.has(file), titlesOf: docs.titles };
    problems.push(...productCheckProblems(docs.prose(doc), context).map((found) => ({ path: doc, ...found })));
  }
  return problems;
}

function placementProblems(file: string): Problem[] {
  if (outOfLayout(file)) return [{ path: file, problem: layoutAdvice }];
  if (misnamedDecision(file)) return [{ path: file, problem: decisionNamingAdvice }];
  return misnamed(file) ? [{ path: file, problem: namingAdvice }] : [];
}

function unreachable(docs: readonly string[], linkedFrom: ReadonlyMap<string, readonly string[]>): Problem[] {
  const reached = new Set(docs.filter(isEntryPoint));
  const queue = [...reached];
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    for (const target of linkedFrom.get(next) ?? []) {
      if (!reached.has(target)) {
        reached.add(target);
        queue.push(target);
      }
    }
  }
  return docs
    .filter((doc) => !reached.has(doc))
    .map((doc) => ({ path: doc, problem: "isn't linked from AGENTS.md, or from any doc it leads to: link it from the doc that routes to its area" }));
}

export function checkDocs({ root, all, prefixes }: Pick<Run, "root" | "all" | "prefixes">, allowances = knownLongDocs): Problem[] {
  const tree = repositoryTree(all);
  const text = cached((doc) => readFileSync(path.join(root, doc), "utf8"));
  const prose = cached((doc) => proseLines(text(doc)));
  const titles = cached((file) => testTitles(file, text(file)));
  const anchors = cached((doc) => headingAnchors(prose(doc)));
  const docs: Docs = { tree, text, prose, anchors, commands: knownCommands(root), titles, allowances };
  const owned = all.filter(isDoc);
  const linkedFrom = new Map<string, string[]>();
  const problems: Problem[] = [];
  for (const doc of owned) {
    const linked: string[] = [];
    problems.push(...linkProblems(doc, docs, linked), ...codeProblems(doc, docs), ...contentProblems(doc, docs));
    linkedFrom.set(doc, linked);
  }
  problems.push(...all.filter(isPlaced).flatMap(placementProblems));
  const gone = staleAllowances((doc) => tree.files.has(doc), allowances);
  problems.push(...gone.map((doc) => ({ path: doc, problem: "no longer exists: remove it from knownLongDocs" })));
  for (const doc of owned) {
    problems.push(...skillProblems(doc, text(doc), linkedFrom.get(skillCatalog) ?? []).map((problem) => ({ path: doc, problem })));
  }
  problems.push(...foldersWithoutASkill(all).map((folder) => ({ path: folder, problem: "has no SKILL.md: add one, or delete the folder" })));
  problems.push(...unreachable(owned, linkedFrom));
  const links = [...linkedFrom.values()].reduce((total, linked) => total + linked.length, 0);
  if (owned.length === 0 || links === 0) {
    problems.push({ path: "AGENTS.md", problem: `the docs check found ${owned.length} docs and ${links} links, so it checked nothing: see isDoc in scripts/checks/docs.ts` });
  }
  return problems.filter((problem) => covers(prefixes, problem.path));
}
