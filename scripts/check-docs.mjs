#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { z } from "zod";
import { directoriesAFreshCheckoutLacks } from "./lib/repo-files.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT_DOCS = ["AGENTS.md", "ARCHITECTURE.md", "README.md"];
const SKILLS_DIR = ".claude/skills";
const SKILLS_CATALOG = "docs/design-docs/agent-workflow.md";
const AGENT_SKILLS_DESCRIPTION_LIMIT = 1024;
const ENTRY_POINTS = ["AGENTS.md", "README.md"];
const DOCS_TOP_LEVEL_ENTRIES = [
  "design-docs", "exec-plans", "generated", "product-specs", "references",
  "DESIGN.md", "FRONTEND.md", "PLANS.md", "PRODUCT_SENSE.md", "QUALITY_SCORE.md", "RELIABILITY.md", "SECURITY.md",
];
const DESIGN_DOC_STATUSES = new Set(["current", "accepted", "historical", "draft"]);
const AGENTS_MAX_LINES = 120;
const PATH_PREFIXES = ["src/", "functions/", "scripts/", "db/", "tests/", "docs/", ".github/", ".claude/", ".mcp.json"];
const LINK_WITH_A_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const GLOB_PLACEHOLDER_OR_COMMAND = /[*<>{}\s]|\.\.\./;

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

function gitIgnored(paths) {
  return new Set(
    paths.length === 0
      ? []
      : spawnSync("git", ["check-ignore", "--stdin"], { cwd: repoRoot, encoding: "utf8", input: paths.join("\n") })
          .stdout.split("\n").filter(Boolean),
  );
}

const files = [
  ...ROOT_DOCS.filter((file) => existsSync(path.join(repoRoot, file))),
  ...walkMarkdown("docs"),
  ...(existsSync(path.join(repoRoot, SKILLS_DIR)) ? walkMarkdown(SKILLS_DIR) : []),
];
const packageManifestSchema = z.object({ scripts: z.record(z.string()).default({}) });
const packageScripts = new Set(
  Object.keys(packageManifestSchema.parse(JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"))).scripts),
);
const errors = [];
const linkGraph = new Map();
let linksChecked = 0;
let pathsChecked = 0;
let scriptsChecked = 0;
const missingPaths = [];
const directoryPaths = [];

for (const file of files) {
  const markdown = readFileSync(path.join(repoRoot, file), "utf8");
  const outsideCodeBlocks = stripFencedCode(markdown);
  const targets = new Set();
  linkGraph.set(file, targets);

  for (const match of markdown.matchAll(/\bpnpm run ([a-z][\w:.-]*\w)/g)) {
    scriptsChecked += 1;
    if (!packageScripts.has(match[1])) {
      errors.push(`${file}:${lineOf(markdown, match.index)} runs "pnpm run ${match[1]}", but package.json has no "${match[1]}" script. Name an existing script, or update the command if the script was renamed.`);
    }
  }

  for (const match of outsideCodeBlocks.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const raw = match[1];
    if (LINK_WITH_A_SCHEME.test(raw)) continue;
    const [rawTarget, anchor] = raw.split("#");
    const target = decodeURIComponent(rawTarget);
    const resolved = target === ""
      ? file
      : path.posix.normalize(target.startsWith("/") ? target.slice(1) : path.posix.join(path.posix.dirname(file), target));
    linksChecked += 1;
    const where = `${file}:${lineOf(outsideCodeBlocks, match.index)}`;
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

  for (const match of outsideCodeBlocks.matchAll(/`([^`\n]+)`/g)) {
    const candidate = match[1].trim().replace(/[.,;:]+$/, "").replace(/:\d+(-\d+)?$/, "");
    if (!PATH_PREFIXES.some((prefix) => candidate.startsWith(prefix))) continue;
    if (GLOB_PLACEHOLDER_OR_COMMAND.test(candidate)) continue;
    pathsChecked += 1;
    const where = `${file}:${lineOf(outsideCodeBlocks, match.index)}`;
    if (!existsSync(path.join(repoRoot, candidate))) {
      missingPaths.push({ candidate, where });
    } else if (statSync(path.join(repoRoot, candidate)).isDirectory()) {
      directoryPaths.push({ candidate, where });
    }
  }
}

const directoriesNotCheckedOut = directoriesAFreshCheckoutLacks(repoRoot, [...new Set(directoryPaths.map(({ candidate }) => candidate))]);
for (const { candidate, where } of directoryPaths) {
  if (directoriesNotCheckedOut.has(candidate)) missingPaths.push({ candidate, where, untracked: true });
}

const runtimeOutputs = gitIgnored(missingPaths.map(({ candidate }) => candidate));
for (const { candidate, where, untracked } of missingPaths) {
  if (runtimeOutputs.has(candidate)) continue;
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

function checkLayout() {
  const rootMarkdown = readdirSync(repoRoot).filter((name) => name.endsWith(".md"));
  const ignoredRoot = gitIgnored(rootMarkdown);
  for (const name of rootMarkdown) {
    if (!ROOT_DOCS.includes(name) && !ignoredRoot.has(name)) {
      errors.push(`${name} is not an allowed root document (${ROOT_DOCS.join(", ")}). Move its content into docs/ (for example docs/PRODUCT_SENSE.md or a design doc) and link it from AGENTS.md.`);
    }
  }
  for (const name of readdirSync(path.join(repoRoot, "docs"))) {
    if (!DOCS_TOP_LEVEL_ENTRIES.includes(name)) {
      errors.push(`docs/${name} is outside the docs layout. Allowed entries: ${DOCS_TOP_LEVEL_ENTRIES.join(", ")}. Put design and runbook material in docs/design-docs/, user-facing behavior in docs/product-specs/, and third-party docs in docs/references/.`);
    }
  }
}
checkLayout();

function checkIndexListsEveryDoc(dir, { requireStatus }) {
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
checkIndexListsEveryDoc("docs/design-docs", { requireStatus: true });
checkIndexListsEveryDoc("docs/product-specs", { requireStatus: false });

function checkSkills() {
  if (!existsSync(path.join(repoRoot, SKILLS_DIR))) return;
  const catalog = readFileSync(path.join(repoRoot, SKILLS_CATALOG), "utf8");
  for (const entry of readdirSync(path.join(repoRoot, SKILLS_DIR), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillFile = `${SKILLS_DIR}/${entry.name}/SKILL.md`;
    if (!existsSync(path.join(repoRoot, skillFile))) {
      errors.push(`${SKILLS_DIR}/${entry.name}/ has no SKILL.md. Add one, or delete the folder.`);
      continue;
    }
    const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(readFileSync(path.join(repoRoot, skillFile), "utf8"))?.[1];
    let fields = {};
    try {
      fields = yaml.load(frontmatter ?? "") ?? {};
    } catch (error) {
      errors.push(`${skillFile}: its frontmatter is not valid YAML (${error.message.split("\n")[0]}).`);
    }
    if (fields.name !== entry.name) {
      errors.push(`${skillFile}: set "name: ${entry.name}" in its frontmatter, the name of its folder.`);
    }
    if (typeof fields.description !== "string" || fields.description.trim() === "") {
      errors.push(`${skillFile}: add a frontmatter description saying what the skill does and when to use it; Claude reads it to decide when to load the skill.`);
    } else if (fields.description.length > AGENT_SKILLS_DESCRIPTION_LIMIT) {
      errors.push(`${skillFile}: its description has ${fields.description.length} characters (limit ${AGENT_SKILLS_DESCRIPTION_LIMIT}). Move detail into the body.`);
    }
    if (!catalog.includes(`](../../${skillFile})`)) {
      errors.push(`${skillFile} is not listed in ${SKILLS_CATALOG}. Add it to the skills table under Agent tooling.`);
    }
  }
}
checkSkills();

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
console.log(`Docs OK: ${files.length} files, ${linksChecked} links, ${pathsChecked} repository paths, ${scriptsChecked} script commands, ${reachable.size} pages reachable.`);
