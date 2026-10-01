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

export const NAVIGATE_WHILE_VISIT_IS_CURRENT_MESSAGE =
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

const isFunction = (node) => node?.type === "ArrowFunctionExpression" || node?.type === "FunctionExpression";

const isAsyncFunction = (node) => isFunction(node) && node.async;

const isPromiseCallbackCall = (call) =>
  call.callee.type === "MemberExpression" &&
  !call.callee.computed &&
  call.callee.property.type === "Identifier" &&
  PROMISE_CALLBACKS.has(call.callee.property.name);

const referenceName = (node) => (node.type === "Identifier" ? node.name : callName({ callee: node }));

const EFFECT_HOOKS = new Set(["useEffect", "useLayoutEffect"]);

const hookName = (call) => {
  const { callee } = call;
  if (callee.type === "Identifier") return callee.name;
  return callee.type === "MemberExpression" && callee.property.type === "Identifier" ? callee.property.name : "";
};

const returnsEarly = (statement) =>
  statement.type === "ReturnStatement" ||
  (statement.type === "BlockStatement" && statement.body.some((inner) => inner.type === "ReturnStatement"));

export const navigateWhileVisitIsCurrent = {
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

    const isGated = (call, body, visitChecks) => {
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
          if (child === node.consequent && visitChecks.current(condition)) return true;
          if (child === node.alternate && visitChecks.ended(condition)) return true;
        }
        if (node.type === "BlockStatement") {
          const earlier = node.body.slice(0, node.body.indexOf(child));
          const returnedOnceTheVisitEnded = earlier.some(
            (statement) =>
              statement.type === "IfStatement" &&
              returnsEarly(statement.consequent) &&
              visitChecks.ended(textOf(statement.test)),
          );
          if (returnedOnceTheVisitEnded) return true;
        }
      }
      return false;
    };

    const reported = new Set();
    const report = (node, messageId, call) => {
      if (reported.has(node)) return;
      reported.add(node);
      context.report({ node, messageId, data: { call } });
    };

    const isSetToTrue = (node) =>
      node.type === "AssignmentExpression" &&
      node.operator === "=" &&
      node.left.type === "Identifier" &&
      node.right.type === "Literal" &&
      node.right.value === true;

    const flagsTheCleanupSets = (effect) => {
      if (!isFunction(effect) || effect.body.type !== "BlockStatement") return [];
      return effect.body.body
        .filter((statement) => statement.type === "ReturnStatement" && isFunction(statement.argument))
        .flatMap((statement) => descendants(statement.argument.body, isSetToTrue))
        .map((assignment) => assignment.left.name);
    };

    const flagsAnEffectCleanupSetsAround = (node) => {
      for (let ancestor = node.parent; ancestor; ancestor = ancestor.parent) {
        if (isCall(ancestor) && EFFECT_HOOKS.has(hookName(ancestor))) return flagsTheCleanupSets(ancestor.arguments[0]);
      }
      return [];
    };

    const visitChecksFor = (fn) => {
      const saveResults = saveResultsNullOnceTheVisitEnded(fn.body);
      const cancelledFlags = flagsAnEffectCleanupSetsAround(fn);
      const withoutSpaces = (condition) => condition.replace(/\s+/g, "");
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

    const movesIn = (body) => descendants(body, (node) => isCall(node) && CALLS_THAT_MOVE_THE_USER.has(callName(node)));

    const checkHandler = (fn) => {
      const awaits = descendants(fn.body, (node) => node.type === "AwaitExpression");
      if (awaits.length === 0) return;
      const firstAwaitEnd = Math.min(...awaits.map((expression) => expression.range[1]));
      const visitChecks = visitChecksFor(fn);
      for (const call of movesIn(fn.body)) {
        if (call.range[0] >= firstAwaitEnd && !isGated(call, fn.body, visitChecks)) {
          report(call, "ungated", callName(call));
        }
      }
    };

    const checkPromiseCallback = (callback) => {
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
