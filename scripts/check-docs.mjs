#!/usr/bin/env node
// Mechanical checks for the repository knowledge base (AGENTS.md, root docs, docs/**).
// - the root and docs/ follow the fixed layout (see DOCS_LAYOUT)
// - relative Markdown links (and #anchors into Markdown files) resolve
// - backticked repository paths such as `src/lib/api.ts` exist, and backticked
//   directories hold a file git tracks (an emptied folder is missing from a fresh checkout)
// - every docs/**/*.md page is reachable from AGENTS.md or README.md
// - design docs and product specs are catalogued in their index.md
// - AGENTS.md stays a short map rather than an encyclopedia
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { directoriesWithoutFiles } from "./lib/repo-files.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT_DOCS = ["AGENTS.md", "ARCHITECTURE.md", "README.md"];
const ENTRY_POINTS = ["AGENTS.md", "README.md"];
// The only entries allowed directly under docs/.
const DOCS_LAYOUT = [
  "design-docs", "exec-plans", "generated", "product-specs", "references",
  "DESIGN.md", "FRONTEND.md", "PLANS.md", "PRODUCT_SENSE.md", "QUALITY_SCORE.md", "RELIABILITY.md", "SECURITY.md",
];
const DESIGN_DOC_STATUSES = new Set(["current", "accepted", "historical", "draft"]);
const AGENTS_MAX_LINES = 120;
const PATH_PREFIXES = ["src/", "functions/", "scripts/", "db/", "tests/", "docs/", ".github/"];

function walkMarkdown(dir) {
  return readdirSync(path.join(repoRoot, dir), { withFileTypes: true }).flatMap((entry) => {
    const relative = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) return walkMarkdown(relative);
    return entry.name.endsWith(".md") ? [relative] : [];
  });
}

function stripFencedCode(markdown) {
  return markdown.replace(/^(```|~~~)[\s\S]*?^\1/gm, (block) => block.replace(/[^\n]/g, ""));
}

function slugify(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[`*~]/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

const anchorCache = new Map();
function anchorsFor(file) {
  if (!anchorCache.has(file)) {
    const seen = new Map();
    const anchors = new Set();
    for (const match of stripFencedCode(readFileSync(path.join(repoRoot, file), "utf8")).matchAll(/^#{1,6}\s+(.+)$/gm)) {
      const base = slugify(match[1]);
      const count = seen.get(base) ?? 0;
      seen.set(base, count + 1);
      anchors.add(count === 0 ? base : `${base}-${count}`);
    }
    anchorCache.set(file, anchors);
  }
  return anchorCache.get(file);
}

function lineOf(text, index) {
  return text.slice(0, index).split("\n").length;
}

const files = [...ROOT_DOCS.filter((file) => existsSync(path.join(repoRoot, file))), ...walkMarkdown("docs")];
const errors = [];
const linkGraph = new Map();
let linksChecked = 0;
let pathsChecked = 0;
const missingPaths = [];
const directoryPaths = [];

for (const file of files) {
  const text = stripFencedCode(readFileSync(path.join(repoRoot, file), "utf8"));
  const targets = new Set();
  linkGraph.set(file, targets);

  for (const match of text.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const raw = match[1];
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) continue; // http:, https:, mailto:
    const [rawTarget, anchor] = raw.split("#");
    const target = decodeURIComponent(rawTarget);
    const resolved = target === ""
      ? file
      : path.posix.normalize(target.startsWith("/") ? target.slice(1) : path.posix.join(path.posix.dirname(file), target));
    linksChecked += 1;
    const where = `${file}:${lineOf(text, match.index)}`;
    if (!existsSync(path.join(repoRoot, resolved))) {
      errors.push(`${where} links to "${raw}", but ${resolved} does not exist. Fix the link, or if the file moved, update every reference to it.`);
      continue;
    }
    if (resolved.endsWith(".md")) targets.add(resolved);
    if (statSync(path.join(repoRoot, resolved)).isDirectory()) {
      for (const index of ["README.md", "index.md"]) targets.add(path.posix.join(resolved, index));
    }
    if (anchor && resolved.endsWith(".md") && !anchorsFor(resolved).has(anchor.toLowerCase())) {
      errors.push(`${where} links to "#${anchor}", but ${resolved} has no heading with that anchor. Link to an existing heading.`);
    }
  }

  for (const match of text.matchAll(/`([^`\n]+)`/g)) {
    const candidate = match[1].trim().replace(/[.,;:]+$/, "").replace(/:\d+(-\d+)?$/, "");
    if (!PATH_PREFIXES.some((prefix) => candidate.startsWith(prefix))) continue;
    if (/[*<>{}\s]|\.\.\./.test(candidate)) continue; // globs, placeholders, commands
    pathsChecked += 1;
    const where = `${file}:${lineOf(text, match.index)}`;
    if (!existsSync(path.join(repoRoot, candidate))) {
      missingPaths.push({ candidate, where });
    } else if (statSync(path.join(repoRoot, candidate)).isDirectory()) {
      directoryPaths.push({ candidate, where });
    }
  }
}

// A folder with no tracked file (for example one emptied by moving its last file
// with `mv`) passes existsSync here but is missing from CI and fresh checkouts.
const untrackedDirectories = directoriesWithoutFiles(repoRoot, [...new Set(directoryPaths.map(({ candidate }) => candidate))]);
for (const { candidate, where } of directoryPaths) {
  if (untrackedDirectories.has(candidate)) missingPaths.push({ candidate, where, untracked: true });
}

// Gitignored paths (test output, logs) are generated at runtime and may legitimately be absent.
const ignored = new Set(
  missingPaths.length === 0
    ? []
    : spawnSync("git", ["check-ignore", "--stdin"], {
        cwd: repoRoot,
        encoding: "utf8",
        input: missingPaths.map(({ candidate }) => candidate).join("\n"),
      }).stdout.split("\n").filter(Boolean),
);
for (const { candidate, where, untracked } of missingPaths) {
  if (ignored.has(candidate)) continue;
  errors.push(
    untracked
      ? `${where} references \`${candidate}\`, which holds no file git tracks, so a fresh checkout will not have it. If the folder should stay, commit a .gitkeep in it; otherwise update the reference.`
      : `${where} references \`${candidate}\`, which does not exist. Update the path or remove the stale reference.`,
  );
}

const reachable = new Set();
const queue = ENTRY_POINTS.filter((file) => linkGraph.has(file));
while (queue.length > 0) {
  const file = queue.pop();
  if (reachable.has(file)) continue;
  reachable.add(file);
  for (const target of linkGraph.get(file) ?? []) {
    if (linkGraph.has(target)) queue.push(target);
  }
}
for (const file of files) {
  if (file.startsWith("docs/") && !reachable.has(file)) {
    errors.push(`${file} is not reachable from ${ENTRY_POINTS.join(", ")}. Link it from the nearest index page or delete it.`);
  }
}

// Layout: root Markdown files and docs/ entries.
const gitIgnored = (paths) => new Set(
  paths.length === 0
    ? []
    : spawnSync("git", ["check-ignore", "--stdin"], { cwd: repoRoot, encoding: "utf8", input: paths.join("\n") })
        .stdout.split("\n").filter(Boolean),
);
const rootMarkdown = readdirSync(repoRoot).filter((name) => name.endsWith(".md"));
const ignoredRoot = gitIgnored(rootMarkdown);
for (const name of rootMarkdown) {
  if (!ROOT_DOCS.includes(name) && !ignoredRoot.has(name)) {
    errors.push(`${name} is not an allowed root document (${ROOT_DOCS.join(", ")}). Move its content into docs/ (for example docs/PRODUCT_SENSE.md or a design doc) and link it from AGENTS.md.`);
  }
}
for (const name of readdirSync(path.join(repoRoot, "docs"))) {
  if (!DOCS_LAYOUT.includes(name)) {
    errors.push(`docs/${name} is outside the docs layout. Allowed entries: ${DOCS_LAYOUT.join(", ")}. Put design and runbook material in docs/design-docs/, user-facing behavior in docs/product-specs/, and third-party docs in docs/references/.`);
  }
}

// Catalogs: every design doc and product spec is listed in its folder's index.md.
function checkCatalog(dir, { requireStatus }) {
  const indexPath = `${dir}/index.md`;
  if (!existsSync(path.join(repoRoot, indexPath))) {
    errors.push(`${indexPath} is missing. Create it and list every document in ${dir}/.`);
    return;
  }
  const index = readFileSync(path.join(repoRoot, indexPath), "utf8");
  const docs = readdirSync(path.join(repoRoot, dir)).filter((name) => name.endsWith(".md") && name !== "index.md");
  for (const name of docs) {
    const row = index.split("\n").find((line) => line.includes(`](${name})`));
    if (!row) {
      errors.push(`${dir}/${name} is not listed in ${indexPath}. Add it${requireStatus ? " with a status and last-verified date" : ""}.`);
      continue;
    }
    if (requireStatus) {
      const cells = row.split("|").map((cell) => cell.trim());
      if (!DESIGN_DOC_STATUSES.has(cells[2]) || !/^\d{4}-\d{2}-\d{2}$/.test(cells[3] ?? "")) {
        errors.push(`${indexPath}: the row for ${name} needs a status (${[...DESIGN_DOC_STATUSES].join(", ")}) and a Last verified date (YYYY-MM-DD).`);
      }
    }
  }
}
checkCatalog("docs/design-docs", { requireStatus: true });
checkCatalog("docs/product-specs", { requireStatus: false });

const agentsLines = readFileSync(path.join(repoRoot, "AGENTS.md"), "utf8").trimEnd().split("\n").length;
if (agentsLines > AGENTS_MAX_LINES) {
  errors.push(`AGENTS.md has ${agentsLines} lines (limit ${AGENTS_MAX_LINES}). Keep it a map: move detail into docs/ and link to it.`);
}

if (files.length === 0 || linksChecked === 0) {
  errors.push("No Markdown files or links were checked; the docs checker is misconfigured.");
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  console.error(`\nDocs check failed with ${errors.length} problem(s).`);
  process.exit(1);
}
console.log(`Docs OK: ${files.length} files, ${linksChecked} links, ${pathsChecked} repository paths, ${reachable.size} pages reachable.`);
