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

const functionOrAppRouterMethodName = (call: ts.CallExpression): string => {
  if (ts.isIdentifier(call.expression)) return call.expression.text;
  const callee = call.expression;
  return ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    callee.expression.text === 'router'
    ? `router.${callee.name.text}`
    : '';
};

const isCallTo = (names: Set<string>) => (node: ts.Node): node is ts.CallExpression =>
  ts.isCallExpression(node) && names.has(functionOrAppRouterMethodName(node));

const asyncConstFunctionsByName = (source: ts.SourceFile): Map<string, ts.ConciseBody> => {
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

const CALLS_THAT_MOVE_THE_USER = new Set([
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
  'router.push',
  'router.replace',
  'startBillingCheckout',
  'startUpgrade',
]);

const HELPERS_THAT_CALL_BACK_ONLY_WHILE_THE_VISIT_IS_CURRENT = new Set([
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

const namesOfSaveResultsThatAreNullOnceTheVisitEnded = (body: ts.Node): string[] =>
  collect(body, ts.isVariableDeclaration)
    .filter(
      (declaration) =>
        declaration.initializer &&
        ts.isAwaitExpression(declaration.initializer) &&
        ts.isCallExpression(declaration.initializer.expression) &&
        functionOrAppRouterMethodName(declaration.initializer.expression) === 'saveTemplateForVisit',
    )
    .map((declaration) => declaration.name.getText());

const passesTheVisitToItsCallee = (call: ts.CallExpression) =>
  call.arguments.some((argument) => /\bvisit\b/.test(argument.getText()));

const isCallbackOfAVisitHelper = (node: ts.Node, child: ts.Node) =>
  ts.isCallExpression(node) &&
  HELPERS_THAT_CALL_BACK_ONLY_WHILE_THE_VISIT_IS_CURRENT.has(functionOrAppRouterMethodName(node)) &&
  node.arguments.some((argument) => argument === child);

const isInABranchTakenOnlyWhileTheVisitIsCurrent = (node: ts.Node, child: ts.Node) => {
  if (!ts.isIfStatement(node)) return false;
  const condition = node.expression.getText();
  return (
    (child === node.thenStatement && IS_CURRENT.test(condition) && !NOT_CURRENT.test(condition)) ||
    (child === node.elseStatement && NOT_CURRENT.test(condition))
  );
};

const followsAReturnOnceTheVisitEnded = (
  node: ts.Node,
  child: ts.Node,
  testsThatTheVisitEnded: (condition: string) => boolean,
) => {
  if (!ts.isBlock(node)) return false;
  const earlier = node.statements.slice(0, node.statements.indexOf(child as ts.Statement));
  return earlier.some(
    (statement) =>
      ts.isIfStatement(statement) &&
      returnsEarly(statement.thenStatement) &&
      testsThatTheVisitEnded(statement.expression.getText()),
  );
};

const isGated = (call: ts.CallExpression, body: ts.Node): boolean => {
  if (passesTheVisitToItsCallee(call)) return true;

  const saveResults = namesOfSaveResultsThatAreNullOnceTheVisitEnded(body);
  const testsThatTheVisitEnded = (condition: string) =>
    NOT_CURRENT.test(condition) || saveResults.some((name) => condition.includes(`!${name}`));

  let child: ts.Node = call;
  for (let node = call.parent; node && child !== body; child = node, node = node.parent) {
    if (
      isCallbackOfAVisitHelper(node, child) ||
      isInABranchTakenOnlyWhileTheVisitIsCurrent(node, child) ||
      followsAReturnOnceTheVisitEnded(node, child, testsThatTheVisitEnded)
    ) {
      return true;
    }
  }
  return false;
};

const ungatedMovesAfterAwait = (body: ts.Node): ts.CallExpression[] => {
  const awaits = collect(body, ts.isAwaitExpression);
  if (awaits.length === 0) return [];
  const firstAwaitEnd = Math.min(...awaits.map((expression) => expression.getEnd()));
  return collect(body, isCallTo(CALLS_THAT_MOVE_THE_USER)).filter(
    (call) => call.getStart() >= firstAwaitEnd && !isGated(call, body),
  );
};

const HANDLERS_THAT_MOVE_THE_USER_AFTER_A_REQUEST: Array<[string, string[]]> = [
  ['src/views/TemplateEditor.tsx', ['handleSave']],
  [
    'src/views/TemplateDetail.tsx',
    ['handleStartRun', 'handleShare', 'handleCloneTemplate', 'handleDelete', 'handleTogglePublic'],
  ],
  ['src/views/PublicTemplate.tsx', ['handleStartRun', 'handleSaveTemplate']],
  ['src/features/dashboard-templates/useDashboardTemplatesModel.ts', ['createRunFromTemplate']],
  ['src/views/Templates.tsx', ['handleRunConfirm']],
  ['src/components/TemplateBackup.tsx', ['exportAll', 'handleConfirmImport']],
  ['src/views/ChecklistRun.tsx', ['handleCompleteRun']],
];

const UNGATED_ON_PURPOSE: Record<string, string> = {
  'src/components/DevLoginBar.tsx:handleQuickLogin': 'development sign-in',
  'src/views/Register.tsx:handleSubmit': 'the account exists; show its next step',
  'src/views/ResetPassword.tsx:handleSubmit': 'the password changed; sign in with it',
};

const SIGN_IN_OR_CHECKOUT_REDIRECT_HELPERS =
  /\b(?:handleUpgradeRequiredForContext|navigateToLoginWithReturnPath|startBillingCheckout|handleAccessFailure|reportDashboardTemplateRunFailure)\b/;

const FILES_USING_REDIRECT_HELPERS_ONLY_ON_A_DIRECT_CLICK: Record<string, string> = {
  'src/lib/access-flow.ts': 'defines them',
  'src/features/template-editor/useTemplateEditorAccess.ts': 'notice buttons',
};

const ungatedHandlers = (): Map<string, string[]> => {
  const found = new Map<string, string[]>();
  for (const file of listSourceFiles('src')) {
    const source = parseSource(file);
    for (const [name, body] of asyncConstFunctionsByName(source)) {
      const moves = ungatedMovesAfterAwait(body);
      if (moves.length > 0) {
        found.set(
          `${file}:${name}`,
          moves.map((call) => {
            const { line } = source.getLineAndCharacterOfPosition(call.getStart());
            return `${functionOrAppRouterMethodName(call)}() at line ${line + 1}`;
          }),
        );
      }
    }
  }
  return found;
};

describe('navigation after a request', () => {
  it.each(HANDLERS_THAT_MOVE_THE_USER_AFTER_A_REQUEST)('%s starts a page visit before each request', (path, names) => {
    const source = parseSource(path);
    const handlers = asyncConstFunctionsByName(source);

    expect(source.getFullText()).toMatch(/\busePageVisit\(/);
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

  it('moves the user after an await only while the page visit is current, in every async handler a scan of src/ finds', () => {
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
      if (file in FILES_USING_REDIRECT_HELPERS_ONLY_ON_A_DIRECT_CLICK) return false;
      const source = readSource(file);
      return SIGN_IN_OR_CHECKOUT_REDIRECT_HELPERS.test(source) && !/\busePageVisit\(/.test(source);
    });

    expect(unguarded).toEqual([]);
  });
});
