import type { Rule } from "eslint";
import type * as ESTree from "estree";

type FunctionNode = ESTree.ArrowFunctionExpression | ESTree.FunctionExpression;
type VisitChecks = { current: (condition: string) => boolean; ended: (condition: string) => boolean };

const CALLS_THAT_MOVE_THE_USER = new Set([
  "goToLogin",
  "handleAccessFailure",
  "handleBackupFailure",
  "handleUpgrade",
  "handleUpgradeRequiredForContext",
  "leaveRun",
  "navigate",
  "navigateTo",
  "navigateToLoginWithReturnPath",
  "reportDashboardTemplateRunFailure",
  "router.push",
  "router.replace",
  "startBillingCheckout",
  "startUpgrade",
]);

const HELPERS_THAT_CALL_BACK_ONLY_WHILE_THE_VISIT_IS_CURRENT = new Set([
  "finishDashboardTemplateRun",
  "followTemplateActionResult",
  "reportDashboardTemplateRunFailure",
  "saveTemplateForVisit",
]);

const MOVE_ON_WHEREVER_THE_USER_WENT = "moveOnAfterAnAccountChange";

const PROMISE_CALLBACKS = new Set(["then", "catch", "finally"]);

const IS_CURRENT = /\bvisit\.isCurrent\(\)/;
const NOT_CURRENT = /!\s*visit\.isCurrent\(\)/;
const MENTIONS_THE_VISIT = /\bvisit\b/;

const NAVIGATE_WHILE_VISIT_IS_CURRENT_MESSAGE =
  "{{call}}() moves the user after an await without checking that they are still on this page, so a request that " +
  "finishes after they left pulls them back. Start a visit with usePageVisit() before the request and move only " +
  "while visit.isCurrent() (or return early once it is not), or pass the visit to a helper that checks it. When an " +
  "account change means the user must move on wherever they went (sign-in, sign-up, a password reset), call it inside " +
  `${MOVE_ON_WHEREVER_THE_USER_WENT}() from src/lib/navigation/moveOnAfterAnAccountChange.ts.`;

const NAVIGATE_IN_A_PROMISE_CALLBACK_MESSAGE =
  "{{call}}() moves the user in a .then(), .catch() or .finally() callback, which runs once a request settles, " +
  "without checking that they are still on this page, so a request that finishes after they left pulls them back. " +
  "Check visit.isCurrent() inside the callback (or return early once it is not), pass the visit to a helper that " +
  "checks it, or await the request in a handler that started a visit with usePageVisit(). When an account change " +
  `means the user must move on wherever they went, call it inside ${MOVE_ON_WHEREVER_THE_USER_WENT}().`;

const callName = ({ callee }: { callee: ESTree.Node }): string => {
  if (callee.type === "Identifier") return callee.name;
  return callee.type === "MemberExpression" &&
    callee.object.type === "Identifier" &&
    callee.object.name === "router" &&
    callee.property.type === "Identifier"
    ? `router.${callee.property.name}`
    : "";
};

const isNode = (value: unknown): value is ESTree.Node =>
  typeof value === "object" && value !== null && "type" in value && typeof value.type === "string";

const isCall = (node: ESTree.Node): node is ESTree.CallExpression => node.type === "CallExpression";

const isFunction = (node: ESTree.Node | null | undefined): node is FunctionNode =>
  node?.type === "ArrowFunctionExpression" || node?.type === "FunctionExpression";

const isAsyncFunction = (node: ESTree.Node | null | undefined): node is FunctionNode => isFunction(node) && node.async === true;

const isPromiseCallbackCall = (call: ESTree.CallExpression) =>
  call.callee.type === "MemberExpression" &&
  !call.callee.computed &&
  call.callee.property.type === "Identifier" &&
  PROMISE_CALLBACKS.has(call.callee.property.name);

const referenceName = (node: ESTree.Node) => (node.type === "Identifier" ? node.name : callName({ callee: node }));

const EFFECT_HOOKS = new Set(["useEffect", "useLayoutEffect"]);

const hookName = ({ callee }: ESTree.CallExpression): string => {
  if (callee.type === "Identifier") return callee.name;
  return callee.type === "MemberExpression" && callee.property.type === "Identifier" ? callee.property.name : "";
};

const returnsEarly = (statement: ESTree.Statement) =>
  statement.type === "ReturnStatement" ||
  (statement.type === "BlockStatement" && statement.body.some((inner) => inner.type === "ReturnStatement"));

const flagSetToTrue = (node: ESTree.Node): string[] =>
  node.type === "AssignmentExpression" &&
  node.operator === "=" &&
  node.left.type === "Identifier" &&
  node.right.type === "Literal" &&
  node.right.value === true
    ? [node.left.name]
    : [];

export const navigateWhileVisitIsCurrent: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow moving the user (navigating, redirecting to sign-in or checkout) after an await in an async " +
        "handler, or in a promise's .then(), .catch() or .finally() callback, without checking that the page visit " +
        "is still current.",
    },
    schema: [],
    messages: { ungated: NAVIGATE_WHILE_VISIT_IS_CURRENT_MESSAGE, ungatedCallback: NAVIGATE_IN_A_PROMISE_CALLBACK_MESSAGE },
  },
  create(context) {
    const { sourceCode } = context;
    const textOf = (node: ESTree.Node) => sourceCode.getText(node);
    const ancestorsNearestFirst = (node: ESTree.Node) => sourceCode.getAncestors(node).reverse();

    const descendants = (root: ESTree.Node): ESTree.Node[] => {
      const found: ESTree.Node[] = [];
      const visit = (node: ESTree.Node) => {
        found.push(node);
        for (const key of sourceCode.visitorKeys[node.type] ?? []) {
          const child: unknown = Reflect.get(node, key);
          const children: unknown[] = Array.isArray(child) ? child : [child];
          for (const each of children) {
            if (isNode(each)) visit(each);
          }
        }
      };
      visit(root);
      return found;
    };

    const saveResultsNullOnceTheVisitEnded = (body: ESTree.Node) =>
      descendants(body).flatMap((node) =>
        node.type === "VariableDeclarator" &&
        node.init?.type === "AwaitExpression" &&
        isCall(node.init.argument) &&
        callName(node.init.argument) === "saveTemplateForVisit"
          ? [textOf(node.id)]
          : [],
      );

    const isGated = (call: ESTree.CallExpression, body: ESTree.Node, visitChecks: VisitChecks) => {
      if (call.arguments.some((argument) => MENTIONS_THE_VISIT.test(textOf(argument)))) return true;
      let child: ESTree.Node = call;
      for (const node of ancestorsNearestFirst(call)) {
        if (child === body) break;
        if (isCall(node) && node.arguments.some((argument) => argument === child)) {
          const helper = callName(node);
          if (HELPERS_THAT_CALL_BACK_ONLY_WHILE_THE_VISIT_IS_CURRENT.has(helper)) return true;
          if (helper === MOVE_ON_WHEREVER_THE_USER_WENT) return true;
        }
        if (node.type === "IfStatement") {
          const condition = textOf(node.test);
          if (child === node.consequent && visitChecks.current(condition)) return true;
          if (child === node.alternate && visitChecks.ended(condition)) return true;
        }
        if (node.type === "BlockStatement") {
          const earlier = node.body.slice(0, node.body.findIndex((statement) => statement === child));
          const returnedOnceTheVisitEnded = earlier.some(
            (statement) =>
              statement.type === "IfStatement" &&
              returnsEarly(statement.consequent) &&
              visitChecks.ended(textOf(statement.test)),
          );
          if (returnedOnceTheVisitEnded) return true;
        }
        child = node;
      }
      return false;
    };

    const reported = new Set<ESTree.Node>();
    const report = (node: ESTree.Node, messageId: "ungated" | "ungatedCallback", call: string) => {
      if (reported.has(node)) return;
      reported.add(node);
      context.report({ node, messageId, data: { call } });
    };

    const flagsTheCleanupSets = (effect: ESTree.Node | undefined): string[] => {
      if (!isFunction(effect) || effect.body.type !== "BlockStatement") return [];
      return effect.body.body
        .flatMap((statement) =>
          statement.type === "ReturnStatement" && isFunction(statement.argument) ? descendants(statement.argument.body) : [],
        )
        .flatMap(flagSetToTrue);
    };

    const flagsAnEffectCleanupSetsAround = (node: ESTree.Node): string[] => {
      for (const ancestor of ancestorsNearestFirst(node)) {
        if (isCall(ancestor) && EFFECT_HOOKS.has(hookName(ancestor))) return flagsTheCleanupSets(ancestor.arguments[0]);
      }
      return [];
    };

    const visitChecksFor = (fn: FunctionNode): VisitChecks => {
      const saveResults = saveResultsNullOnceTheVisitEnded(fn.body);
      const cancelledFlags = flagsAnEffectCleanupSetsAround(fn);
      const withoutSpaces = (condition: string) => condition.replace(/\s+/g, "");
      return {
        current: (condition) =>
          (IS_CURRENT.test(condition) && !NOT_CURRENT.test(condition)) ||
          cancelledFlags.some((flag) => withoutSpaces(condition) === `!${flag}`),
        ended: (condition) =>
          NOT_CURRENT.test(condition) ||
          saveResults.some((name) => condition.includes(`!${name}`)) ||
          cancelledFlags.includes(withoutSpaces(condition)),
      };
    };

    const movesIn = (body: ESTree.Node) =>
      descendants(body).filter(isCall).filter((call) => CALLS_THAT_MOVE_THE_USER.has(callName(call)));

    const checkHandler = (fn: FunctionNode) => {
      const awaits = descendants(fn.body).filter((node) => node.type === "AwaitExpression");
      if (awaits.length === 0) return;
      const firstAwaitEnd = Math.min(...awaits.map((expression) => sourceCode.getRange(expression)[1]));
      const visitChecks = visitChecksFor(fn);
      for (const call of movesIn(fn.body)) {
        if (sourceCode.getRange(call)[0] >= firstAwaitEnd && !isGated(call, fn.body, visitChecks)) {
          report(call, "ungated", callName(call));
        }
      }
    };

    const checkPromiseCallback = (callback: ESTree.Expression | ESTree.SpreadElement) => {
      const passedByName = referenceName(callback);
      if (CALLS_THAT_MOVE_THE_USER.has(passedByName)) {
        report(callback, "ungatedCallback", passedByName);
        return;
      }
      if (!isFunction(callback)) return;
      const visitChecks = visitChecksFor(callback);
      for (const call of movesIn(callback.body)) {
        if (!isGated(call, callback.body, visitChecks)) report(call, "ungatedCallback", callName(call));
      }
    };

    return {
      CallExpression(call) {
        if (isPromiseCallbackCall(call)) call.arguments.forEach(checkPromiseCallback);
      },
      VariableDeclarator(declarator) {
        if (declarator.id.type === "Identifier" && isAsyncFunction(declarator.init)) checkHandler(declarator.init);
      },
    };
  },
};
