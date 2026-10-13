import ts from "typescript";

export type TestTitle = { kind: "exact"; text: string } | { kind: "pattern"; parts: string[] };

const TEST_FUNCTIONS = new Set(["it", "test", "describe", "suite"]);
const TEST_MODIFIERS = new Set(["describe", "each", "serial", "parallel", "concurrent", "sequential"]);
const PLAYWRIGHT_TAGS = /^(?:@[\w-]+\s+)+/;

export const isTestFile = (file: string) => /\.(?:test|spec)\.(?:[cm]?[jt]s|[jt]sx)$/.test(file);

const isEach = (expression: ts.Expression) =>
  ts.isPropertyAccessExpression(expression) && expression.name.text === "each" && isTestCall(expression);

function isTestCall(callee: ts.Expression): boolean {
  if (ts.isIdentifier(callee)) return TEST_FUNCTIONS.has(callee.text);
  if (ts.isPropertyAccessExpression(callee)) return TEST_MODIFIERS.has(callee.name.text) && isTestCall(callee.expression);
  if (ts.isCallExpression(callee)) return isEach(callee.expression);
  if (ts.isTaggedTemplateExpression(callee)) return isEach(callee.tag);
  return false;
}

function titleOf(argument: ts.Expression | undefined): TestTitle | undefined {
  if (argument === undefined) return undefined;
  if (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument)) return { kind: "exact", text: argument.text };
  if (ts.isTemplateExpression(argument)) {
    return { kind: "pattern", parts: [argument.head.text, ...argument.templateSpans.map((span) => span.literal.text)] };
  }
  return undefined;
}

export function testTitles(file: string, text: string): TestTitle[] {
  const kind = file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false, kind);
  const titles: TestTitle[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && isTestCall(node.expression)) {
      const title = titleOf(node.arguments[0]);
      if (title) titles.push(title);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return titles;
}

const collapse = (text: string) => text.replace(/\s+/g, " ");
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function patternOf(parts: readonly string[]): RegExp {
  const last = parts.length - 1;
  const fixed = parts.map((part, index) => {
    const collapsed = collapse(part);
    if (index === 0) return escapeRegExp(collapsed.trimStart());
    return escapeRegExp(index === last ? collapsed.trimEnd() : collapsed);
  });
  return new RegExp(`^${fixed.join(".*")}$`);
}

function matchesTitle(title: TestTitle, quoted: string): boolean {
  if (title.kind === "exact") {
    const text = collapse(title.text).trim();
    return text === quoted || text.replace(PLAYWRIGHT_TAGS, "") === quoted;
  }
  const [first = "", ...rest] = title.parts;
  return patternOf(title.parts).test(quoted) || patternOf([first.replace(PLAYWRIGHT_TAGS, ""), ...rest]).test(quoted);
}

export const hasTitle = (titles: readonly TestTitle[], quoted: string) =>
  titles.some((title) => matchesTitle(title, collapse(quoted).trim()));
