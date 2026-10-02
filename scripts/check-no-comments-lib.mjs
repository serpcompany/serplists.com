import { spawnSync } from "node:child_process";
import path from "node:path";
import ts from "typescript";
import { isScalar, parseAllDocuments, Parser, visit } from "yaml";

import {
  cssCommentRanges,
  dotenvCommentRanges,
  gitattributesCommentRanges,
  gitignoreCommentRanges,
  jsonCommentRanges,
  lineLocator,
  npmrcCommentRanges,
  scriptCommentRanges,
  shellCommentRanges,
  sqlCommentRanges,
  tomlCommentRanges,
  xmlCommentRanges,
} from "./lib/comment-ranges.mjs";

export { NO_COMMENTS_MESSAGE } from "./eslint-rules/no-comments.mjs";

export const GENERATED_FILES = [
  "pnpm-lock.yaml",
  "cloudflare-env.d.ts",
  "docs/generated/portable-template-pack.schema.json",
  "functions/sitemap/bundled-catalog.generated.json",
  "docs/product-specs/portable-templates/examples/full/template.json",
  "docs/product-specs/portable-templates/examples/full/preview.html",
  "docs/product-specs/portable-templates/examples/minimal/template.json",
  "docs/product-specs/portable-templates/examples/minimal/preview.html",
];

export const WORKFLOWS_AWAITING_A_PERSON = [".github/workflows/claude-code-review.yml", ".github/workflows/maintenance.yml"];

export const DOCUMENTATION_FORMATS = [".md"];

export const FORMATS_WITHOUT_COMMENTS = [
  ".txt",
  ".gitkeep",
  ".ico",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".avif",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".zip",
];

const FILE_LANGUAGES = new Map([
  [".yml", "yaml"],
  [".yaml", "yaml"],
  [".toml", "toml"],
  [".sql", "sql"],
  [".css", "css"],
  [".json", "json"],
  [".jsonc", "json"],
  [".xml", "xml"],
  [".xsd", "xml"],
  [".svg", "xml"],
  [".patch", "patch"],
  [".diff", "patch"],
]);

const DOTFILE_LANGUAGES = [
  [/^\.(?:dev\.vars|env)(?:\.[\w.-]+)?$/, "dotenv"],
  [/^\.gitignore$/, "gitignore"],
  [/^\.gitattributes$/, "gitattributes"],
  [/^\.npmrc$/, "npmrc"],
];

const SCRIPT_KINDS = new Map([
  [".js", ts.ScriptKind.JS],
  [".mjs", ts.ScriptKind.JS],
  [".cjs", ts.ScriptKind.JS],
  [".jsx", ts.ScriptKind.JSX],
  [".ts", ts.ScriptKind.TS],
  [".mts", ts.ScriptKind.TS],
  [".cts", ts.ScriptKind.TS],
  [".tsx", ts.ScriptKind.TSX],
]);

const LANGUAGE_NAMES = {
  yaml: "YAML",
  toml: "TOML",
  sql: "SQL",
  css: "CSS",
  json: "JSON",
  xml: "XML",
  dotenv: "dotenv",
  gitignore: ".gitignore",
  gitattributes: ".gitattributes",
  npmrc: ".npmrc",
};
const COMMENT_RANGES = {
  toml: tomlCommentRanges,
  sql: sqlCommentRanges,
  css: cssCommentRanges,
  json: jsonCommentRanges,
  xml: xmlCommentRanges,
  dotenv: dotenvCommentRanges,
  gitignore: gitignoreCommentRanges,
  gitattributes: gitattributesCommentRanges,
  npmrc: npmrcCommentRanges,
  shell: shellCommentRanges,
};
const TYPESCRIPT_KINDS = new Set([ts.ScriptKind.TS, ts.ScriptKind.TSX]);

const FILES_WITH_COMMAND_BLOCKS = /^\.github\/(?:workflows|actions)\/|(?:^|\/)\.?lefthook(?:-local)?\.ya?ml$/;
const GITHUB_EXPRESSION = /\$\{\{[\s\S]*?\}\}/g;
const HUNK_HEADER = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/;

const toPosix = (file) => file.replaceAll("\\", "/");
const extensionOf = (posixPath) => path.posix.extname(posixPath).toLowerCase();
const scriptLanguageName = (scriptKind) => (TYPESCRIPT_KINDS.has(scriptKind) ? "TypeScript" : "JavaScript");

function languageOf(posixPath) {
  const extension = extensionOf(posixPath);
  if (FILE_LANGUAGES.has(extension)) return FILE_LANGUAGES.get(extension);
  if (SCRIPT_KINDS.has(extension)) return null;
  const name = path.posix.basename(posixPath);
  return DOTFILE_LANGUAGES.find(([pattern]) => pattern.test(name))?.[1] ?? null;
}

export function checkedLanguage(file) {
  const posixPath = toPosix(file);
  if (GENERATED_FILES.includes(posixPath)) return null;
  return languageOf(posixPath);
}

export function awaitsAPerson(file) {
  return WORKFLOWS_AWAITING_A_PERSON.includes(toPosix(file));
}

export function commentCheckOf(file) {
  const posixPath = toPosix(file);
  const extension = extensionOf(posixPath);
  if (GENERATED_FILES.includes(posixPath)) return "generated";
  if (checkedLanguage(posixPath)) return "check-no-comments";
  if (SCRIPT_KINDS.has(extension)) return "ESLint";
  if (DOCUMENTATION_FORMATS.includes(extension)) return "documentation";
  const format = extension || path.posix.basename(posixPath);
  return FORMATS_WITHOUT_COMMENTS.includes(format) ? "no comment syntax" : null;
}

export function filesGitTracksOrWouldTrack() {
  const listed = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (listed.error) throw listed.error;
  if (listed.status !== 0) throw new Error(`git ls-files failed: ${listed.stderr}`);
  return listed.stdout.split("\0").filter(Boolean);
}

export function findComments(file, text) {
  const posixPath = toPosix(file);
  const language = checkedLanguage(posixPath);
  if (language === "patch") return patchComments(text);
  if (language === "yaml") return yamlComments(text, { commandBlocks: FILES_WITH_COMMAND_BLOCKS.test(posixPath) });
  if (!language) return [];
  return commentLines(language, text).map(({ line }) => ({ line, language: LANGUAGE_NAMES[language] }));
}

function yamlComments(text, { commandBlocks = false } = {}) {
  const comments = commentLines("yaml", text).map(({ line }) => ({ line, language: "YAML" }));
  if (!commandBlocks) return comments;
  const lineOf = lineLocator(text);
  for (const block of commandBlocksOf(text)) {
    const firstLine = lineOf(block.start) + (block.literal ? 1 : 0);
    const language = block.javascript ? "script" : "shell";
    const code = block.code.replace(GITHUB_EXPRESSION, (expression) => expression.replace(/[^\n]/g, "_"));
    for (const { line } of commentLines(language, code)) {
      comments.push({
        line: block.literal ? firstLine + line - 1 : firstLine,
        language: `${block.javascript ? "JavaScript" : "shell"} in a YAML run block`,
      });
    }
  }
  return comments.sort((first, second) => first.line - second.line);
}

function patchComments(text) {
  const lines = text.split("\n").map((line) => line.replace(/\r$/, ""));
  const comments = [];
  let target = null;
  let index = 0;
  while (index < lines.length) {
    const header = HUNK_HEADER.exec(lines[index]);
    if (lines[index].startsWith("+++ ")) target = patchTarget(lines[index]);
    index += 1;
    if (!header) continue;
    const hunk = [];
    let oldLeft = header[1] === undefined ? 1 : Number(header[1]);
    let newLeft = header[2] === undefined ? 1 : Number(header[2]);
    while (index < lines.length && (oldLeft > 0 || newLeft > 0 || lines[index].startsWith("\\"))) {
      const marker = lines[index][0];
      if (marker !== "-" && marker !== "\\") hunk.push({ text: lines[index].slice(1), added: marker === "+", patchLine: index + 1 });
      if (marker !== "+" && marker !== "\\") oldLeft -= 1;
      if (marker !== "-" && marker !== "\\") newLeft -= 1;
      index += 1;
    }
    if (target) comments.push(...addedComments(target, hunk));
  }
  return comments;
}

function patchTarget(header) {
  const target = header.slice(4).trim().replace(/^b\//, "");
  return target === "/dev/null" ? null : target;
}

function addedComments(target, hunk) {
  const scriptKind = SCRIPT_KINDS.get(extensionOf(target));
  const language = scriptKind === undefined ? languageOf(toPosix(target)) : "script";
  if (!language || language === "patch") return [];
  const languageName = language === "script" ? scriptLanguageName(scriptKind) : LANGUAGE_NAMES[language];
  const found = commentLines(language, hunk.map((line) => line.text).join("\n"), scriptKind);
  return found.flatMap(({ line, endLine }) => {
    const added = hunk.slice(line - 1, endLine).find((hunkLine) => hunkLine.added);
    return added ? [{ line: added.patchLine, language: `${languageName} added by a patch` }] : [];
  });
}

function commentLines(language, text, scriptKind = ts.ScriptKind.JS) {
  const lineOf = lineLocator(text);
  return commentRanges(language, text, scriptKind).map(({ start, end }) => ({
    line: lineOf(start),
    endLine: lineOf(Math.max(start, end - 1)),
  }));
}

function commentRanges(language, text, scriptKind) {
  if (language === "yaml") return yamlCommentRanges(text);
  return COMMENT_RANGES[language]?.(text) ?? scriptCommentRanges(text, scriptKind);
}

function yamlCommentRanges(text) {
  const ranges = new Map();
  const collect = (token) => {
    if (Array.isArray(token)) token.forEach(collect);
    else if (token?.type === "comment") ranges.set(token.offset, { start: token.offset, end: token.offset + token.source.length });
    else if (token && typeof token === "object") Object.values(token).forEach(collect);
  };
  for (const token of new Parser().parse(text)) collect(token);
  return [...ranges.values()];
}

function commandBlocksOf(text) {
  const blocks = [];
  for (const document of parseAllDocuments(text)) {
    const [error] = document.errors;
    if (error) throw new Error(`YAML could not be parsed: ${error.message}`);
    visit(document, {
      Map(_key, map) {
        const valueOf = (key) => map.items.find((pair) => isScalar(pair.key) && pair.key.value === key)?.value;
        const run = valueOf("run");
        if (!isScalar(run) || typeof run.value !== "string") return;
        const shell = valueOf("shell");
        const shellName = isScalar(shell) ? String(shell.value) : "bash";
        const javascript = /^node\b/.test(shellName);
        if (!javascript && !/^(?:bash|sh)\b/.test(shellName)) return;
        blocks.push({ code: run.value, start: run.range[0], literal: run.type === "BLOCK_LITERAL", javascript });
      },
    });
  }
  return blocks;
}
