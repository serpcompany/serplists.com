import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// Browser tests set up and read their data with apiRequest()/apiJson() from
// tests/e2e/support/api-requests.ts. A fetch run inside page.evaluate() goes through the
// page, and the local dev proxy drops such requests now and then while the page has its
// own in flight: the spec fails with "TypeError: Failed to fetch" though the product works.
// A test whose subject is a fetch the page itself sends keeps it, with an
// `e2e-in-page-fetch: <reason>` comment above the statement.

const E2E_DIR = path.join('tests', 'e2e');
const MARKER = /e2e-in-page-fetch:\s*\S/;
const GLOBALS = new Set(['window', 'globalThis', 'self']);

type InPageFetch = { file: string; line: number; allowed: boolean };

// fetch(...), or window/globalThis/self.fetch(...)
function isFetchCall(node: ts.Node) {
  if (!ts.isCallExpression(node)) return false;
  const callee = node.expression;
  if (ts.isIdentifier(callee)) return callee.text === 'fetch';
  return ts.isPropertyAccessExpression(callee) &&
    callee.name.text === 'fetch' &&
    ts.isIdentifier(callee.expression) &&
    GLOBALS.has(callee.expression.text);
}

// x.evaluate(...) or x.evaluateHandle(...), on a page, frame, locator or handle.
function isEvaluateCall(node: ts.Node): node is ts.CallExpression {
  return ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    ['evaluate', 'evaluateHandle'].includes(node.expression.name.text);
}

function containsFetch(node: ts.Node): boolean {
  return isFetchCall(node) || (ts.forEachChild(node, (child) => containsFetch(child) || undefined) ?? false);
}

// The comments just above the statement that holds `node`.
function leadingComments(node: ts.Node, source: ts.SourceFile) {
  let statement = node;
  while (statement.parent && !ts.isBlock(statement.parent) && !ts.isSourceFile(statement.parent)) {
    statement = statement.parent;
  }
  return (ts.getLeadingCommentRanges(source.text, statement.getFullStart()) ?? [])
    .map((range) => source.text.slice(range.pos, range.end));
}

function findInPageFetches(file: string, text: string): InPageFetch[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const found: InPageFetch[] = [];
  const visit = (node: ts.Node) => {
    if (isEvaluateCall(node) && node.arguments.some(containsFetch)) {
      found.push({
        file,
        line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
        allowed: leadingComments(node, source).some((comment) => MARKER.test(comment)),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

function specFiles() {
  return readdirSync(E2E_DIR, { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith('.spec.ts'))
    .map((name) => path.join(E2E_DIR, name).split(path.sep).join('/'))
    .sort();
}

describe('API calls in the browser tests', () => {
  it('finds fetch calls inside page.evaluate and reads their marker', () => {
    const source = `
      async function create(page) {
        return page.evaluate(async (url) => (await fetch(url, { method: 'POST' })).json(), apiUrl);
      }
      test('x', async ({ page }) => {
        await tab.evaluate(() => window.fetch('/api/x'));
        // The page's own request is what this test checks.
        // e2e-in-page-fetch: checks the browser's CORS preflight.
        const status = await page.evaluate(async () => (await fetch('/api/y')).status);
        await page.evaluate(() => window.scrollTo(0, 0));
        await route.fulfill({ response: await route.fetch() });
        await page.request.fetch('/api/z');
      });
    `;

    expect(findInPageFetches('example.spec.ts', source)).toEqual([
      { file: 'example.spec.ts', line: 3, allowed: false },
      { file: 'example.spec.ts', line: 6, allowed: false },
      { file: 'example.spec.ts', line: 9, allowed: true },
    ]);
  });

  it('go through the API helper, not a fetch inside page.evaluate', () => {
    const files = specFiles();
    const unmarked = files
      .flatMap((file) => findInPageFetches(file, readFileSync(file, 'utf8')))
      .filter(({ allowed }) => !allowed)
      .map(({ file, line }) => `${file}:${line}`);

    expect(files.length).toBeGreaterThan(0);
    expect(
      unmarked,
      'Call the API with apiRequest() or apiJson() from tests/e2e/support/api-requests.ts. ' +
        'If the page\'s own fetch is what the test checks, put an `e2e-in-page-fetch: <reason>` comment above it.',
    ).toEqual([]);
  });
});
