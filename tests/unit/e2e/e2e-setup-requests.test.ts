import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const E2E_DIR = path.join('tests', 'e2e');
const PAGE_FETCH_HELPER = { file: 'tests/e2e/support/api-requests.ts', name: 'fetchFromThePageUnderTest' };
const GLOBAL_OBJECTS = new Set(['window', 'globalThis', 'self']);
const EVALUATE_METHODS = new Set(['evaluate', 'evaluateHandle']);

type InPageFetch = { file: string; line: number; allowed: boolean };

function isGlobalFetchCall(node: ts.Node) {
  if (!ts.isCallExpression(node)) return false;
  const callee = node.expression;
  if (ts.isIdentifier(callee)) return callee.text === 'fetch';
  return ts.isPropertyAccessExpression(callee) &&
    callee.name.text === 'fetch' &&
    ts.isIdentifier(callee.expression) &&
    GLOBAL_OBJECTS.has(callee.expression.text);
}

function isEvaluateCallOnAnyTarget(node: ts.Node): node is ts.CallExpression {
  return ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    EVALUATE_METHODS.has(node.expression.name.text);
}

function containsFetch(node: ts.Node): boolean {
  return isGlobalFetchCall(node) || (ts.forEachChild(node, (child) => containsFetch(child) || undefined) ?? false);
}

function isInsidePageFetchHelper(file: string, node: ts.Node) {
  return file === PAGE_FETCH_HELPER.file &&
    ts.findAncestor(node, ts.isFunctionDeclaration)?.name?.text === PAGE_FETCH_HELPER.name;
}

function findInPageFetches(file: string, text: string): InPageFetch[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const found: InPageFetch[] = [];
  const visit = (node: ts.Node) => {
    if (isEvaluateCallOnAnyTarget(node) && node.arguments.some(containsFetch)) {
      found.push({
        file,
        line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
        allowed: isInsidePageFetchHelper(file, node),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

function e2eSourceFiles() {
  return readdirSync(E2E_DIR, { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith('.ts'))
    .map((name) => path.join(E2E_DIR, name).split(path.sep).join('/'))
    .sort();
}

describe('API calls in the browser tests', () => {
  it('finds fetch calls inside page.evaluate, and allows only the one in the page-fetch helper', () => {
    const spec = `
      async function create(page) {
        return page.evaluate(async (url) => (await fetch(url, { method: 'POST' })).json(), apiUrl);
      }
      test('x', async ({ page }) => {
        await tab.evaluate(() => window.fetch('/api/x'));
        const { status } = await fetchFromThePageUnderTest(page, '/api/y');
        await page.evaluate(() => window.scrollTo(0, 0));
        await route.fulfill({ response: await route.fetch() });
        await page.request.fetch('/api/z');
      });
    `;
    const support = `
      export async function fetchFromThePageUnderTest(page, url) {
        return page.evaluate(async (to) => (await fetch(to)).status, url);
      }
      export async function anotherHelper(page) {
        return page.evaluate(() => globalThis.fetch('/api/w'));
      }
    `;

    expect(findInPageFetches('example.spec.ts', spec)).toEqual([
      { file: 'example.spec.ts', line: 3, allowed: false },
      { file: 'example.spec.ts', line: 6, allowed: false },
    ]);
    expect(findInPageFetches(PAGE_FETCH_HELPER.file, support)).toEqual([
      { file: PAGE_FETCH_HELPER.file, line: 3, allowed: true },
      { file: PAGE_FETCH_HELPER.file, line: 6, allowed: false },
    ]);
    expect(findInPageFetches('tests/e2e/support/other.ts', support).map(({ allowed }) => allowed)).toEqual([false, false]);
  });

  it('has the page-fetch helper the failure message names, with its one in-page fetch', () => {
    const helperFetches = findInPageFetches(PAGE_FETCH_HELPER.file, readFileSync(PAGE_FETCH_HELPER.file, 'utf8'));

    expect(helperFetches.map(({ allowed }) => allowed)).toEqual([true]);
  });

  it('go through the API helper, not a fetch inside page.evaluate', () => {
    const files = e2eSourceFiles();
    const disallowed = files
      .flatMap((file) => findInPageFetches(file, readFileSync(file, 'utf8')))
      .filter(({ allowed }) => !allowed)
      .map(({ file, line }) => `${file}:${line}`);

    expect(files.length).toBeGreaterThan(0);
    expect(
      disallowed,
      'Set up and read data with apiRequest() or apiJson() from tests/e2e/support/api-requests.ts. If how the browser ' +
        `itself sends the request is what the test checks (a CORS preflight, say), send it with ${PAGE_FETCH_HELPER.name}() ` +
        'from the same file.',
    ).toEqual([]);
  });
});
