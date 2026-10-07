import { Input } from "postcss";
import tokenizeCss from "postcss/lib/tokenize";
import ts from "typescript";
import { z } from "zod";

export type CommentRange = { start: number; end: number };

const SHELL_WORD_BREAKS = new Set([" ", "\t", "\r", "\n", ";", "&", "|", "(", ")", "<", ">"]);
const SHELL_PARAMETER_START = /[#?$!@*\-\w]/;
const HEREDOC_OPERATOR = /^(-?)[ \t]*(?:'([^'\n]*)'|"([^"\n]*)"|\\?([^\s;&|()<>]+))/;
const DOTENV_ASSIGNMENT = /^[ \t]*(?:export[ \t]+)?[\w.-]+[ \t]*(?:=|:[ \t])[ \t]*/;
const DOTENV_QUOTES = new Set(['"', "'", "`"]);

const cssCommentTokenSchema = z.tuple([z.literal("comment"), z.string(), z.number(), z.number()]);

export function lineLocator(text: string): (offset: number) => number {
  const lineStarts = [0];
  for (let index = text.indexOf("\n"); index !== -1; index = text.indexOf("\n", index + 1)) lineStarts.push(index + 1);
  return (offset) => {
    let low = 0;
    let high = lineStarts.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if ((lineStarts[middle] ?? Number.POSITIVE_INFINITY) <= offset) low = middle;
      else high = middle - 1;
    }
    return low + 1;
  };
}

function lineEnd(text: string, position: number): number {
  const end = text.indexOf("\n", position);
  return end === -1 ? text.length : end;
}

function toLineEnd(text: string, start: number): CommentRange {
  return { start, end: lineEnd(text, start) };
}

function afterToken(text: string, token: string, from: number): number {
  const index = text.indexOf(token, from);
  return index === -1 ? text.length : index + token.length;
}

export function tomlCommentRanges(text: string): CommentRange[] {
  const ranges: CommentRange[] = [];
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

function afterMultilineString(text: string, start: number): number {
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

function afterLineString(text: string, start: number): number {
  const quote = text[start];
  let position = start + 1;
  while (position < text.length && text[position] !== "\n") {
    if (quote === '"' && text[position] === "\\") position += 2;
    else if (text[position] === quote) return position + 1;
    else position += 1;
  }
  return position;
}

export function sqlCommentRanges(text: string): CommentRange[] {
  const ranges: CommentRange[] = [];
  let position = 0;
  while (position < text.length) {
    const char = text[position];
    if (text.startsWith("--", position)) {
      ranges.push(toLineEnd(text, position));
      position = lineEnd(text, position);
    } else if (text.startsWith("/*", position)) {
      const end = afterToken(text, "*/", position + 2);
      ranges.push({ start: position, end });
      position = end;
    } else if (char === "'" || char === '"' || char === "`") position = afterDoubledQuote(text, position);
    else if (char === "[") position = afterToken(text, "]", position + 1);
    else position += 1;
  }
  return ranges;
}

function afterDoubledQuote(text: string, start: number): number {
  const quote = text[start];
  let position = start + 1;
  while (position < text.length) {
    if (text[position] !== quote) position += 1;
    else if (text[position + 1] === quote) position += 2;
    else return position + 1;
  }
  return text.length;
}

export function cssCommentRanges(text: string): CommentRange[] {
  const tokens = tokenizeCss(new Input(text));
  const ranges: CommentRange[] = [];
  while (!tokens.endOfFile()) {
    const comment = cssCommentTokenSchema.safeParse(tokens.nextToken());
    if (comment.success) {
      const [, , start, end] = comment.data;
      ranges.push({ start, end: end + 1 });
    }
  }
  return ranges;
}

export function jsonCommentRanges(text: string): CommentRange[] {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, text);
  const ranges: CommentRange[] = [];
  for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) {
    if (kind === ts.SyntaxKind.SingleLineCommentTrivia || kind === ts.SyntaxKind.MultiLineCommentTrivia) {
      ranges.push({ start: scanner.getTokenStart(), end: scanner.getTokenEnd() });
    }
  }
  return ranges;
}

export function xmlCommentRanges(text: string): CommentRange[] {
  const ranges: CommentRange[] = [];
  let position = 0;
  while (position < text.length) {
    if (text.startsWith("<![CDATA[", position)) position = afterToken(text, "]]>", position + 9);
    else if (text.startsWith("<?", position)) position = afterToken(text, "?>", position + 2);
    else if (text.startsWith("<!--", position)) {
      const end = afterToken(text, "-->", position + 4);
      ranges.push({ start: position, end });
      position = end;
    } else position += 1;
  }
  return ranges;
}

const MARKDOWN_FENCE = /^ {0,3}(`{3,}|~{3,})/;
const MARKDOWN_CODE_SPAN = /(`+)[^`][\s\S]*?\1(?!`)/g;

const blankedOut = (code: string) => code.replace(/[^\n]/g, " ");

function withoutMarkdownCode(text: string): string {
  let openFence: string | null = null;
  return text
    .split("\n")
    .map((line) => {
      const fence = MARKDOWN_FENCE.exec(line)?.[1];
      if (openFence === null && fence) {
        openFence = fence;
        return blankedOut(line);
      }
      if (openFence !== null) {
        if (fence && fence.startsWith(openFence.charAt(0)) && fence.length >= openFence.length) openFence = null;
        return blankedOut(line);
      }
      return line;
    })
    .join("\n")
    .replace(MARKDOWN_CODE_SPAN, blankedOut);
}

export function markdownCommentRanges(text: string): CommentRange[] {
  return xmlCommentRanges(withoutMarkdownCode(text));
}

function lineCommentRanges(text: string, commentStartInLine: (line: string) => number): CommentRange[] {
  const ranges: CommentRange[] = [];
  let position = 0;
  while (position < text.length) {
    const end = lineEnd(text, position);
    const offset = commentStartInLine(text.slice(position, end));
    if (offset !== -1) ranges.push({ start: position + offset, end });
    position = end + 1;
  }
  return ranges;
}

const firstNonBlank = (line: string) => line.search(/\S/);

export function gitignoreCommentRanges(text: string): CommentRange[] {
  return lineCommentRanges(text, (line) => (line.startsWith("#") ? 0 : -1));
}

export function gitattributesCommentRanges(text: string): CommentRange[] {
  return lineCommentRanges(text, (line) => {
    const start = firstNonBlank(line);
    return start !== -1 && line[start] === "#" ? start : -1;
  });
}

export function npmrcCommentRanges(text: string): CommentRange[] {
  return lineCommentRanges(text, (line) => {
    const start = firstNonBlank(line);
    if (start === -1) return -1;
    if (line[start] === ";" || line[start] === "#") return start;
    const equals = line.indexOf("=");
    return equals === -1 ? -1 : iniValueComment(line, equals + 1);
  });
}

function iniValueComment(line: string, valueStart: number): number {
  const value = line.slice(valueStart).trim();
  const quoted = value.length > 1 && (value[0] === '"' || value[0] === "'") && value.endsWith(value[0]);
  if (quoted) return -1;
  for (let index = valueStart; index < line.length; index += 1) {
    if (line[index] === "\\") index += 1;
    else if (line[index] === ";" || line[index] === "#") return index;
  }
  return -1;
}

export function dotenvCommentRanges(text: string): CommentRange[] {
  const ranges: CommentRange[] = [];
  let position = 0;
  while (position < text.length) {
    const end = lineEnd(text, position);
    const line = text.slice(position, end);
    const start = firstNonBlank(line);
    const assignment = DOTENV_ASSIGNMENT.exec(line);
    if (start !== -1 && line[start] === "#") ranges.push({ start: position + start, end });
    if (!assignment || line[start] === "#") {
      position = end + 1;
      continue;
    }
    const valueStart = position + assignment[0].length;
    const afterValue = DOTENV_QUOTES.has(text.charAt(valueStart)) ? afterQuotedValue(text, valueStart) : valueStart;
    const valueLineEnd = lineEnd(text, afterValue);
    const hash = text.indexOf("#", afterValue);
    if (hash !== -1 && hash < valueLineEnd) ranges.push(toLineEnd(text, hash));
    position = valueLineEnd + 1;
  }
  return ranges;
}

function afterQuotedValue(text: string, start: number): number {
  const quote = text[start];
  let position = start + 1;
  while (position < text.length && text[position] !== quote) position += text[position] === "\\" ? 2 : 1;
  return Math.min(position + 1, text.length);
}

export function scriptCommentRanges(text: string, scriptKind: ts.ScriptKind): CommentRange[] {
  const sourceFile = ts.createSourceFile("embedded", text, ts.ScriptTarget.Latest, true, scriptKind);
  const shebangLength = ts.getShebang(text)?.length ?? 0;
  const ranges = new Map<number, CommentRange>();
  const collect = (start: number, end: number) => {
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

function scriptTokens(sourceFile: ts.SourceFile): ts.Node[] {
  const tokens: ts.Node[] = [];
  const pending: ts.Node[] = [sourceFile];
  for (let node = pending.pop(); node !== undefined; node = pending.pop()) {
    if (ts.isTokenKind(node.kind)) tokens.push(node);
    else if (!ts.isJSDoc(node)) pending.push(...[...node.getChildren(sourceFile)].reverse());
  }
  return tokens;
}

function isJsxContainer(node: ts.Node | undefined): boolean {
  return node !== undefined && (ts.isJsxElement(node) || ts.isJsxFragment(node));
}

function hasTrailingTrivia(token: ts.Node): boolean {
  const { parent } = token;
  if (token.kind === ts.SyntaxKind.CloseBraceToken) return !ts.isJsxExpression(parent) || !isJsxContainer(parent.parent);
  if (token.kind !== ts.SyntaxKind.GreaterThanToken) return true;
  if (ts.isJsxOpeningElement(parent)) return token.end !== parent.end;
  if (ts.isJsxOpeningFragment(parent)) return false;
  if (ts.isJsxSelfClosingElement(parent)) return token.end !== parent.end || !isJsxContainer(parent.parent);
  if (ts.isJsxClosingElement(parent) || ts.isJsxClosingFragment(parent)) return !isJsxContainer(parent.parent?.parent);
  return true;
}

export function shellCommentRanges(script: string): CommentRange[] {
  const ranges: CommentRange[] = [];
  const heredocs: { stripTabs: boolean; delimiter: string | undefined }[] = [];
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
  const scanCommands = (closer: string | null) => {
    let wordStart = true;
    let depth = 0;
    while (position < script.length) {
      const char = script.charAt(position);
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
