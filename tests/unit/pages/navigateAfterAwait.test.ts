import { readdirSync, readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const readSource = (path: string) =>
  readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');

const listSourceFiles = (dir: string): string[] =>
  readdirSync(new URL(`../../../${dir}`, import.meta.url), { withFileTypes: true }).flatMap(
    (entry) => {
      const relative = `${dir}/${entry.name}`;
      if (entry.isDirectory()) return listSourceFiles(relative);
      return /\.tsx?$/.test(entry.name) ? [relative] : [];
    },
  );

const parseSource = (path: string): ts.SourceFile =>
  ts.createSourceFile(
    path,
    readSource(path),
    ts.ScriptTarget.Latest,
    true,
    path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

const collect = <T extends ts.Node>(root: ts.Node, test: (node: ts.Node) => node is T): T[] => {
  const found: T[] = [];
  const visit = (node: ts.Node) => {
    if (test(node)) found.push(node);
    ts.forEachChild(node, visit);
  };
  visit(root);
  return found;
};

const calleeName = (call: ts.CallExpression): string =>
  ts.isIdentifier(call.expression) ? call.expression.text : '';

const isCallTo = (names: Set<string>) => (node: ts.Node): node is ts.CallExpression =>
  ts.isCallExpression(node) && names.has(calleeName(node));

// Every `const <name> = async ...` function in a file, by name.
const asyncHandlers = (source: ts.SourceFile): Map<string, ts.ConciseBody> => {
  const handlers = new Map<string, ts.ConciseBody>();
  for (const declaration of collect(source, ts.isVariableDeclaration)) {
    const fn = declaration.initializer;
    if (
      ts.isIdentifier(declaration.name) &&
      fn &&
      (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) &&
      fn.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword)
    ) {
      handlers.set(declaration.name.text, fn.body);
    }
  }
  return handlers;
};

// Calls that move the user: a navigate, sign-in or checkout, or a failure reporter
// that can do either.
const MOVES = new Set([
  'goToLogin',
  'handleAccessFailure',
  'handleBackupFailure',
  'handleUpgrade',
  'handleUpgradeRequiredForContext',
  'leaveRun',
  'navigate',
  'navigateTo',
  'navigateToLoginWithReturnPath',
  'reportDashboardTemplateRunFailure',
  'startBillingCheckout',
  'startUpgrade',
]);

// Helpers that are given the visit and call their callbacks only while it is current.
const VISIT_WRAPPERS = new Set([
  'finishDashboardTemplateRun',
  'followTemplateActionResult',
  'reportDashboardTemplateRunFailure',
  'saveTemplateForVisit',
]);

const IS_CURRENT = /\bvisit\.isCurrent\(\)/;
const NOT_CURRENT = /!\s*visit\.isCurrent\(\)/;

const returnsEarly = (statement: ts.Statement): boolean =>
  ts.isReturnStatement(statement) ||
  (ts.isBlock(statement) && statement.statements.some(ts.isReturnStatement));

// Names bound to `await saveTemplateForVisit(...)`, which is null once the visit ended.
const visitResultNames = (body: ts.Node): string[] =>
  collect(body, ts.isVariableDeclaration)
    .filter(
      (declaration) =>
        declaration.initializer &&
        ts.isAwaitExpression(declaration.initializer) &&
        ts.isCallExpression(declaration.initializer.expression) &&
        calleeName(declaration.initializer.expression) === 'saveTemplateForVisit',
    )
    .map((declaration) => declaration.name.getText());

// A move is gated when the visit reaches its callee, when it is a callback given to a
// visit wrapper, when it sits in an `if (visit.isCurrent())` branch, or when an earlier
// statement returns once the visit has ended.
const isGated = (call: ts.CallExpression, body: ts.Node): boolean => {
  if (call.arguments.some((argument) => /\bvisit\b/.test(argument.getText()))) {
    return true;
  }

  const results = visitResultNames(body);
  const leftCondition = (text: string) =>
    NOT_CURRENT.test(text) || results.some((name) => text.includes(`!${name}`));

  let child: ts.Node = call;
  for (let node = call.parent; node && child !== body; child = node, node = node.parent) {
    if (
      ts.isCallExpression(node) &&
      VISIT_WRAPPERS.has(calleeName(node)) &&
      node.arguments.some((argument) => argument === child)
    ) {
      return true;
    }
    if (ts.isIfStatement(node)) {
      const condition = node.expression.getText();
      if (child === node.thenStatement && IS_CURRENT.test(condition) && !NOT_CURRENT.test(condition)) {
        return true;
      }
      if (child === node.elseStatement && NOT_CURRENT.test(condition)) {
        return true;
      }
    }
    if (ts.isBlock(node)) {
      const earlier = node.statements.slice(0, node.statements.indexOf(child as ts.Statement));
      if (
        earlier.some(
          (statement) =>
            ts.isIfStatement(statement) &&
            returnsEarly(statement.thenStatement) &&
            leftCondition(statement.expression.getText()),
        )
      ) {
        return true;
      }
    }
  }
  return false;
};

// The moves after the handler's first await that no page visit gates.
const ungatedMovesAfterAwait = (body: ts.Node): ts.CallExpression[] => {
  const awaits = collect(body, ts.isAwaitExpression);
  if (awaits.length === 0) return [];
  const firstAwaitEnd = Math.min(...awaits.map((expression) => expression.getEnd()));
  return collect(body, isCallTo(MOVES)).filter(
    (call) => call.getStart() >= firstAwaitEnd && !isGated(call, body),
  );
};

// These handlers await a request and then move the user (to a new run or template,
// back to a list, to sign-in or checkout). React Router still runs a navigate() from a
// page the user already left, so each one starts a page visit before the request and
// acts on the result only while that visit is current (see usePageVisit).
const HANDLERS: Array<[string, string[]]> = [
  ['src/pages/TemplateEditor.tsx', ['handleSave']],
  [
    'src/pages/TemplateDetail.tsx',
    ['handleStartRun', 'handleShare', 'handleCloneTemplate', 'handleDelete', 'handleTogglePublic'],
  ],
  ['src/pages/PublicTemplate.tsx', ['handleStartRun', 'handleSaveTemplate']],
  // The model opens a new run; the page reports a failure (sign-in or checkout).
  ['src/features/dashboard-templates/useDashboardTemplatesModel.ts', ['createRunFromTemplate']],
  ['src/pages/Templates.tsx', ['handleRunSubmit']],
  ['src/components/TemplateBackup.tsx', ['exportAll', 'handleConfirmImport']],
  ['src/pages/ChecklistRun.tsx', ['handleCompleteRun']],
];

// Handlers that move the user after an await without a page visit, on purpose.
const UNGATED_ON_PURPOSE: Record<string, string> = {
  // The account flows end on their next step (the console, email verification, sign-in).
  'src/components/DevLoginBar.tsx:handleQuickLogin': 'development sign-in',
  'src/pages/Register.tsx:handleSubmit': 'the account exists; show its next step',
  'src/pages/ResetPassword.tsx:handleSubmit': 'the password changed; sign in with it',
};

// Helpers that navigate to sign-in or start a checkout redirect.
const REDIRECT_HELPER =
  /\b(?:handleUpgradeRequiredForContext|navigateToLoginWithReturnPath|startBillingCheckout|handleAccessFailure|reportDashboardTemplateRunFailure)\b/;

// Files that use those helpers only on a direct click, never after an await.
const DIRECT_CLICK_ONLY: Record<string, string> = {
  // Defines the helpers.
  'src/lib/access-flow.ts': 'defines them',
  // The editor's Upgrade and Sign in buttons; its save goes through saveTemplateForVisit.
  'src/features/template-editor/useTemplateEditorAccess.ts': 'notice buttons',
};

const ungatedHandlers = (): Map<string, string[]> => {
  const found = new Map<string, string[]>();
  for (const file of listSourceFiles('src')) {
    const source = parseSource(file);
    for (const [name, body] of asyncHandlers(source)) {
      const moves = ungatedMovesAfterAwait(body);
      if (moves.length > 0) {
        found.set(
          `${file}:${name}`,
          moves.map((call) => {
            const { line } = source.getLineAndCharacterOfPosition(call.getStart());
            return `${calleeName(call)}() at line ${line + 1}`;
          }),
        );
      }
    }
  }
  return found;
};

describe('navigation after a request', () => {
  it.each(HANDLERS)('%s starts a page visit before each request', (path, names) => {
    const source = parseSource(path);
    const handlers = asyncHandlers(source);

    expect(source.getFullText()).toContain('usePageVisit()');
    for (const name of names) {
      const body = handlers.get(name);
      expect(body, name).toBeDefined();
      const visitStart = collect(body!, isCallTo(new Set(['beginVisit'])))[0];
      expect(visitStart, `${name} calls beginVisit()`).toBeDefined();
      expect(body!.getText(), name).toMatch(
        /isCurrent\(\)|followTemplateActionResult\(|finishDashboardTemplateRun\(|saveTemplateForVisit\(|reportDashboardTemplateRunFailure\(|handleBackupFailure\(/,
      );
    }
  });

  // Found by scanning src/, so a new handler (or a gate removed from an old one) cannot
  // be missed: every navigate, sign-in or checkout after an await waits for the visit.
  it('moves the user after an await only while the page visit is current', () => {
    const ungated = Object.fromEntries(
      [...ungatedHandlers()].filter(([handler]) => !(handler in UNGATED_ON_PURPOSE)),
    );

    expect(ungated).toEqual({});
  });

  it('lists only handlers that still move the user without a visit', () => {
    const ungated = ungatedHandlers();

    expect(Object.keys(UNGATED_ON_PURPOSE).filter((handler) => !ungated.has(handler))).toEqual([]);
  });

  it('every page that can redirect to sign-in or checkout tracks the page visit', () => {
    const unguarded = listSourceFiles('src').filter((file) => {
      if (file in DIRECT_CLICK_ONLY) return false;
      const source = readSource(file);
      return REDIRECT_HELPER.test(source) && !source.includes('usePageVisit()');
    });

    expect(unguarded).toEqual([]);
  });
});
