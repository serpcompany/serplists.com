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

const IS_CURRENT = /\bvisit\.isCurrent\(\)/;
const NOT_CURRENT = /!\s*visit\.isCurrent\(\)/;
const MENTIONS_THE_VISIT = /\bvisit\b/;

export const NAVIGATE_WHILE_VISIT_IS_CURRENT_MESSAGE =
  "{{call}}() moves the user after an await without checking that they are still on this page, so a request that " +
  "finishes after they left pulls them back. Start a visit with usePageVisit() before the request and move only " +
  "while visit.isCurrent() (or return early once it is not), or pass the visit to a helper that checks it. When an " +
  "account change means the user must move on wherever they went (sign-in, sign-up, a password reset), call it inside " +
  `${MOVE_ON_WHEREVER_THE_USER_WENT}() from src/lib/navigation/moveOnAfterAnAccountChange.ts.`;

const callName = (call) => {
  const { callee } = call;
  if (callee.type === "Identifier") return callee.name;
  return callee.type === "MemberExpression" &&
    callee.object.type === "Identifier" &&
    callee.object.name === "router" &&
    callee.property.type === "Identifier"
    ? `router.${callee.property.name}`
    : "";
};

const isAsyncFunction = (node) =>
  (node?.type === "ArrowFunctionExpression" || node?.type === "FunctionExpression") && node.async;

const returnsEarly = (statement) =>
  statement.type === "ReturnStatement" ||
  (statement.type === "BlockStatement" && statement.body.some((inner) => inner.type === "ReturnStatement"));

export const navigateWhileVisitIsCurrent = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow an async handler that moves the user (navigates, redirects to sign-in or checkout) after an await " +
        "without checking that the page visit is still current.",
    },
    schema: [],
    messages: { ungated: NAVIGATE_WHILE_VISIT_IS_CURRENT_MESSAGE },
  },
  create(context) {
    const { sourceCode } = context;
    const textOf = (node) => sourceCode.getText(node);

    const descendants = (root, matches) => {
      const found = [];
      const visit = (node) => {
        if (matches(node)) found.push(node);
        for (const key of sourceCode.visitorKeys[node.type] ?? []) {
          const child = node[key];
          for (const each of Array.isArray(child) ? child : [child]) {
            if (each && typeof each.type === "string") visit(each);
          }
        }
      };
      visit(root);
      return found;
    };

    const isCall = (node) => node.type === "CallExpression";

    const saveResultsNullOnceTheVisitEnded = (body) =>
      descendants(body, (node) => node.type === "VariableDeclarator")
        .filter(
          (declarator) =>
            declarator.init?.type === "AwaitExpression" &&
            isCall(declarator.init.argument) &&
            callName(declarator.init.argument) === "saveTemplateForVisit",
        )
        .map((declarator) => textOf(declarator.id));

    const isGated = (call, body, testsThatTheVisitEnded) => {
      if (call.arguments.some((argument) => MENTIONS_THE_VISIT.test(textOf(argument)))) return true;
      let child = call;
      for (let node = call.parent; node && child !== body; child = node, node = node.parent) {
        if (isCall(node) && node.arguments.includes(child)) {
          const helper = callName(node);
          if (HELPERS_THAT_CALL_BACK_ONLY_WHILE_THE_VISIT_IS_CURRENT.has(helper)) return true;
          if (helper === MOVE_ON_WHEREVER_THE_USER_WENT) return true;
        }
        if (node.type === "IfStatement") {
          const condition = textOf(node.test);
          if (child === node.consequent && IS_CURRENT.test(condition) && !NOT_CURRENT.test(condition)) return true;
          if (child === node.alternate && NOT_CURRENT.test(condition)) return true;
        }
        if (node.type === "BlockStatement") {
          const earlier = node.body.slice(0, node.body.indexOf(child));
          const returnedOnceTheVisitEnded = earlier.some(
            (statement) =>
              statement.type === "IfStatement" &&
              returnsEarly(statement.consequent) &&
              testsThatTheVisitEnded(textOf(statement.test)),
          );
          if (returnedOnceTheVisitEnded) return true;
        }
      }
      return false;
    };

    const checkHandler = (fn) => {
      const awaits = descendants(fn.body, (node) => node.type === "AwaitExpression");
      if (awaits.length === 0) return;
      const firstAwaitEnd = Math.min(...awaits.map((expression) => expression.range[1]));
      const saveResults = saveResultsNullOnceTheVisitEnded(fn.body);
      const testsThatTheVisitEnded = (condition) =>
        NOT_CURRENT.test(condition) || saveResults.some((name) => condition.includes(`!${name}`));
      for (const call of descendants(fn.body, (node) => isCall(node) && CALLS_THAT_MOVE_THE_USER.has(callName(node)))) {
        if (call.range[0] >= firstAwaitEnd && !isGated(call, fn.body, testsThatTheVisitEnded)) {
          context.report({ node: call, messageId: "ungated", data: { call: callName(call) } });
        }
      }
    };

    return {
      VariableDeclarator(declarator) {
        if (declarator.id.type === "Identifier" && isAsyncFunction(declarator.init)) checkHandler(declarator.init);
      },
    };
  },
};
