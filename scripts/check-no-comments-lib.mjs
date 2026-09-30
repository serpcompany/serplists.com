import path from "node:path";
import { Input } from "postcss";
import tokenizeCss from "postcss/lib/tokenize";
import ts from "typescript";
import { isScalar, parseAllDocuments, Parser, visit } from "yaml";

export { NO_COMMENTS_MESSAGE } from "./eslint-rules/no-comments.mjs";

export const GENERATED_FILES = [
  "pnpm-lock.yaml",
  "docs/generated/portable-template-pack.schema.json",
  "functions/sitemap/bundled-catalog.generated.json",
  "docs/product-specs/portable-templates/examples/full/template.json",
  "docs/product-specs/portable-templates/examples/minimal/template.json",
];

const FILE_LANGUAGES = new Map([
  [".yml", "yaml"],
  [".yaml", "yaml"],
  [".toml", "toml"],
  [".sql", "sql"],
  [".css", "css"],
  [".json", "json"],
  [".jsonc", "json"],
  [".patch", "patch"],
  [".diff", "patch"],
]);

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

const LANGUAGE_NAMES = { yaml: "YAML", toml: "TOML", sql: "SQL", css: "CSS", json: "JSON" };
const TYPESCRIPT_KINDS = new Set([ts.ScriptKind.TS, ts.ScriptKind.TSX]);

const FILES_WITH_COMMAND_BLOCKS = /^\.github\/(?:workflows|actions)\/|(?:^|\/)\.?lefthook(?:-local)?\.ya?ml$/;
const GITHUB_EXPRESSION = /\$\{\{[\s\S]*?\}\}/g;
const SHELL_WORD_BREAKS = new Set([" ", "\t", "\r", "\n", ";", "&", "|", "(", ")", "<", ">"]);
const SHELL_PARAMETER_START = /[#?$!@*\-\w]/;
const HEREDOC_OPERATOR = /^(-?)[ \t]*(?:'([^'\n]*)'|"([^"\n]*)"|\\?([^\s;&|()<>]+))/;
const HUNK_HEADER = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/;

const toPosix = (file) => file.replaceAll("\\", "/");
const scriptLanguageName = (scriptKind) => (TYPESCRIPT_KINDS.has(scriptKind) ? "TypeScript" : "JavaScript");

export function checkedLanguage(file) {
  const posixPath = toPosix(file);
  if (GENERATED_FILES.includes(posixPath)) return null;
  return FILE_LANGUAGES.get(path.posix.extname(posixPath).toLowerCase()) ?? null;
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
  const extension = path.posix.extname(target).toLowerCase();
  const scriptKind = SCRIPT_KINDS.get(extension);
  const language = scriptKind === undefined ? FILE_LANGUAGES.get(extension) : "script";
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
  if (language === "toml") return tomlCommentRanges(text);
  if (language === "sql") return sqlCommentRanges(text);
  if (language === "css") return cssCommentRanges(text);
  if (language === "json") return jsonCommentRanges(text);
  if (language === "shell") return shellCommentRanges(text);
  return scriptCommentRanges(text, scriptKind);
}

function lineLocator(text) {
  const lineStarts = [0];
  for (let index = text.indexOf("\n"); index !== -1; index = text.indexOf("\n", index + 1)) lineStarts.push(index + 1);
  return (offset) => {
    let low = 0;
    let high = lineStarts.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (lineStarts[middle] <= offset) low = middle;
      else high = middle - 1;
    }
    return low + 1;
  };
}

function lineEnd(text, position) {
  const end = text.indexOf("\n", position);
  return end === -1 ? text.length : end;
}

function toLineEnd(text, start) {
  return { start, end: lineEnd(text, start) };
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

function tomlCommentRanges(text) {
  const ranges = [];
  let position = 0;
  while (position < text.length) {
    const char = text[position];
    if (text.startsWith('"""', position) || text.startsWith("'''", position)) position = afterMultilineString(text, position);
    else if (char === '"' || char === "'") position = afterLineString(text, position);
    else if (char === "#") {
      ranges.push(toLineEnd(text, position));
      position = lineEnd(text, position);
    } else position += 1;
  }
  return ranges;
}

function afterMultilineString(text, start) {
  const delimiter = text.slice(start, start + 3);
  const escapes = delimiter === '"""';
  let position = start + 3;
  while (position < text.length) {
    if (escapes && text[position] === "\\") position += 2;
    else if (text.startsWith(delimiter, position)) {
      let end = position + 3;
      while (end < text.length && end - position < 5 && text[end] === delimiter[0]) end += 1;
      return end;
    } else position += 1;
  }
  return text.length;
}

function afterLineString(text, start) {
  const quote = text[start];
  let position = start + 1;
  while (position < text.length && text[position] !== "\n") {
    if (quote === '"' && text[position] === "\\") position += 2;
    else if (text[position] === quote) return position + 1;
    else position += 1;
  }
  return position;
}

function sqlCommentRanges(text) {
  const ranges = [];
  let position = 0;
  while (position < text.length) {
    const char = text[position];
    if (text.startsWith("--", position)) {
      ranges.push(toLineEnd(text, position));
      position = lineEnd(text, position);
    } else if (text.startsWith("/*", position)) {
      const close = text.indexOf("*/", position + 2);
      const end = close === -1 ? text.length : close + 2;
      ranges.push({ start: position, end });
      position = end;
    } else if (char === "'" || char === '"' || char === "`") position = afterDoubledQuote(text, position);
    else if (char === "[") {
      const close = text.indexOf("]", position + 1);
      position = close === -1 ? text.length : close + 1;
    } else position += 1;
  }
  return ranges;
}

function afterDoubledQuote(text, start) {
  const quote = text[start];
  let position = start + 1;
  while (position < text.length) {
    if (text[position] !== quote) position += 1;
    else if (text[position + 1] === quote) position += 2;
    else return position + 1;
  }
  return text.length;
}

function cssCommentRanges(text) {
  const tokens = tokenizeCss(new Input(text));
  const ranges = [];
  while (!tokens.endOfFile()) {
    const [type, , start, end] = tokens.nextToken();
    if (type === "comment") ranges.push({ start, end: end + 1 });
  }
  return ranges;
}

function jsonCommentRanges(text) {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, text);
  const ranges = [];
  for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) {
    if (kind === ts.SyntaxKind.SingleLineCommentTrivia || kind === ts.SyntaxKind.MultiLineCommentTrivia) {
      ranges.push({ start: scanner.getTokenStart(), end: scanner.getTokenEnd() });
    }
  }
  return ranges;
}

function scriptCommentRanges(text, scriptKind) {
  const sourceFile = ts.createSourceFile("embedded", text, ts.ScriptTarget.Latest, true, scriptKind);
  const shebangLength = ts.getShebang(text)?.length ?? 0;
  const ranges = new Map();
  const collect = (start, end) => {
    ranges.set(start, { start, end });
  };
  for (const token of scriptTokens(sourceFile)) {
    if (token.kind !== ts.SyntaxKind.JsxText) {
      ts.forEachLeadingCommentRange(text, token.pos === 0 ? shebangLength : token.pos, collect);
    }
    if (hasTrailingTrivia(token)) ts.forEachTrailingCommentRange(text, token.end, collect);
  }
  return [...ranges.values()];
}

function scriptTokens(sourceFile) {
  const tokens = [];
  const pending = [sourceFile];
  while (pending.length > 0) {
    const node = pending.pop();
    if (ts.isTokenKind(node.kind)) tokens.push(node);
    else if (!ts.isJSDoc(node)) pending.push(...node.getChildren(sourceFile).reverse());
  }
  return tokens;
}

function isJsxContainer(node) {
  return node !== undefined && (ts.isJsxElement(node) || ts.isJsxFragment(node));
}

function hasTrailingTrivia(token) {
  const { parent } = token;
  if (token.kind === ts.SyntaxKind.CloseBraceToken) return !ts.isJsxExpression(parent) || !isJsxContainer(parent.parent);
  if (token.kind !== ts.SyntaxKind.GreaterThanToken) return true;
  if (ts.isJsxOpeningElement(parent)) return token.end !== parent.end;
  if (ts.isJsxOpeningFragment(parent)) return false;
  if (ts.isJsxSelfClosingElement(parent)) return token.end !== parent.end || !isJsxContainer(parent.parent);
  if (ts.isJsxClosingElement(parent) || ts.isJsxClosingFragment(parent)) return !isJsxContainer(parent.parent?.parent);
  return true;
}

function shellCommentRanges(script) {
  const ranges = [];
  const heredocs = [];
  let position = 0;

  const skipSingleQuoted = () => {
    const close = script.indexOf("'", position + 1);
    position = close === -1 ? script.length : close + 1;
  };
  const skipAnsiQuoted = () => {
    position += 2;
    while (position < script.length && script[position] !== "'") position += script[position] === "\\" ? 2 : 1;
    position += 1;
  };
  const readHeredocOperator = () => {
    const match = HEREDOC_OPERATOR.exec(script.slice(position));
    if (!match) return;
    heredocs.push({ stripTabs: match[1] === "-", delimiter: match[2] ?? match[3] ?? match[4] });
    position += match[0].length;
  };
  const skipHeredocBodies = () => {
    for (const { delimiter, stripTabs } of heredocs.splice(0)) {
      while (position < script.length) {
        const end = lineEnd(script, position);
        const line = script.slice(position, end).replace(/\r$/, "");
        position = Math.min(end + 1, script.length);
        if ((stripTabs ? line.replace(/^\t+/, "") : line) === delimiter) break;
      }
    }
  };
  const skipArithmetic = () => {
    let depth = 0;
    position += 1;
    while (position < script.length) {
      if (script[position] === "(") depth += 1;
      if (script[position] === ")") depth -= 1;
      position += 1;
      if (depth === 0) return;
    }
  };
  const scanSubstitution = () => {
    if (script.startsWith("$((", position)) skipArithmetic();
    else if (script.startsWith("$(", position)) {
      position += 2;
      scanCommands(")");
    } else if (script.startsWith("${", position)) {
      position += 2;
      scanParameter();
    } else if (script[position] === "`") {
      position += 1;
      scanCommands("`");
    } else return false;
    return true;
  };
  const scanDoubleQuoted = () => {
    position += 1;
    while (position < script.length && script[position] !== '"') {
      if (script[position] === "\\") position += 2;
      else if (!scanSubstitution()) position += 1;
    }
    position += 1;
  };
  const scanParameter = () => {
    while (position < script.length && script[position] !== "}") {
      if (script[position] === "\\") position += 2;
      else if (script[position] === "'") skipSingleQuoted();
      else if (script[position] === '"') scanDoubleQuoted();
      else if (!scanSubstitution()) position += 1;
    }
    position += 1;
  };
  const scanCommands = (closer) => {
    let wordStart = true;
    let depth = 0;
    while (position < script.length) {
      const char = script[position];
      if (char === closer && (closer === "`" || depth === 0)) {
        position += 1;
        return;
      }
      if (char === "#" && wordStart) {
        ranges.push(toLineEnd(script, position));
        position = lineEnd(script, position);
      } else if (char === "\n") {
        position += 1;
        skipHeredocBodies();
        wordStart = true;
      } else if (char === "\\") {
        wordStart = wordStart && script[position + 1] === "\n";
        position += 2;
      } else if (char === "'") {
        skipSingleQuoted();
        wordStart = false;
      } else if (char === '"' || script.startsWith('$"', position)) {
        position += char === "$" ? 1 : 0;
        scanDoubleQuoted();
        wordStart = false;
      } else if (script.startsWith("$'", position)) {
        skipAnsiQuoted();
        wordStart = false;
      } else if (scanSubstitution()) {
        wordStart = false;
      } else if (char === "$") {
        position += SHELL_PARAMETER_START.test(script[position + 1] ?? "") ? 2 : 1;
        wordStart = false;
      } else if (script.startsWith("<<<", position)) {
        position += 3;
        wordStart = true;
      } else if (script.startsWith("<<", position)) {
        position += 2;
        readHeredocOperator();
        wordStart = true;
      } else {
        if (char === "(") depth += 1;
        if (char === ")") depth -= 1;
        wordStart = SHELL_WORD_BREAKS.has(char);
        position += 1;
      }
    }
  };

  scanCommands(null);
  return ranges;
}
