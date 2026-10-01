import { Input } from "postcss";
import tokenizeCss from "postcss/lib/tokenize";
import ts from "typescript";

const SHELL_WORD_BREAKS = new Set([" ", "\t", "\r", "\n", ";", "&", "|", "(", ")", "<", ">"]);
const SHELL_PARAMETER_START = /[#?$!@*\-\w]/;
const HEREDOC_OPERATOR = /^(-?)[ \t]*(?:'([^'\n]*)'|"([^"\n]*)"|\\?([^\s;&|()<>]+))/;
const DOTENV_ASSIGNMENT = /^[ \t]*(?:export[ \t]+)?[\w.-]+[ \t]*(?:=|:[ \t])[ \t]*/;
const DOTENV_QUOTES = new Set(['"', "'", "`"]);

export function lineLocator(text) {
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

function afterToken(text, token, from) {
  const index = text.indexOf(token, from);
  return index === -1 ? text.length : index + token.length;
}

export function tomlCommentRanges(text) {
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

export function sqlCommentRanges(text) {
  const ranges = [];
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

export function cssCommentRanges(text) {
  const tokens = tokenizeCss(new Input(text));
  const ranges = [];
  while (!tokens.endOfFile()) {
    const [type, , start, end] = tokens.nextToken();
    if (type === "comment") ranges.push({ start, end: end + 1 });
  }
  return ranges;
}

export function jsonCommentRanges(text) {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, text);
  const ranges = [];
  for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) {
    if (kind === ts.SyntaxKind.SingleLineCommentTrivia || kind === ts.SyntaxKind.MultiLineCommentTrivia) {
      ranges.push({ start: scanner.getTokenStart(), end: scanner.getTokenEnd() });
    }
  }
  return ranges;
}

export function xmlCommentRanges(text) {
  const ranges = [];
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

function lineCommentRanges(text, commentStartInLine) {
  const ranges = [];
  let position = 0;
  while (position < text.length) {
    const end = lineEnd(text, position);
    const offset = commentStartInLine(text.slice(position, end));
    if (offset !== -1) ranges.push({ start: position + offset, end });
    position = end + 1;
  }
  return ranges;
}

const firstNonBlank = (line) => line.search(/\S/);

export function gitignoreCommentRanges(text) {
  return lineCommentRanges(text, (line) => (line.startsWith("#") ? 0 : -1));
}

export function gitattributesCommentRanges(text) {
  return lineCommentRanges(text, (line) => {
    const start = firstNonBlank(line);
    return start !== -1 && line[start] === "#" ? start : -1;
  });
}

export function npmrcCommentRanges(text) {
  return lineCommentRanges(text, (line) => {
    const start = firstNonBlank(line);
    if (start === -1) return -1;
    if (line[start] === ";" || line[start] === "#") return start;
    const equals = line.indexOf("=");
    return equals === -1 ? -1 : iniValueComment(line, equals + 1);
  });
}

function iniValueComment(line, valueStart) {
  const value = line.slice(valueStart).trim();
  const quoted = value.length > 1 && (value[0] === '"' || value[0] === "'") && value.endsWith(value[0]);
  if (quoted) return -1;
  for (let index = valueStart; index < line.length; index += 1) {
    if (line[index] === "\\") index += 1;
    else if (line[index] === ";" || line[index] === "#") return index;
  }
  return -1;
}

export function dotenvCommentRanges(text) {
  const ranges = [];
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
    const afterValue = DOTENV_QUOTES.has(text[valueStart]) ? afterQuotedValue(text, valueStart) : valueStart;
    const valueLineEnd = lineEnd(text, afterValue);
    const hash = text.indexOf("#", afterValue);
    if (hash !== -1 && hash < valueLineEnd) ranges.push(toLineEnd(text, hash));
    position = valueLineEnd + 1;
  }
  return ranges;
}

function afterQuotedValue(text, start) {
  const quote = text[start];
  let position = start + 1;
  while (position < text.length && text[position] !== quote) position += text[position] === "\\" ? 2 : 1;
  return Math.min(position + 1, text.length);
}

export function scriptCommentRanges(text, scriptKind) {
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

export function shellCommentRanges(script) {
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
