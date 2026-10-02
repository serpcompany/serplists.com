import { navigateWhileVisitIsCurrent } from '../../../scripts/eslint-rules/navigate-while-visit-is-current';
import { typescriptRuleTester } from '../../support/ruleTester';

const ungated = (call: string) => ({ messageId: 'ungated', data: { call } });
const ungatedCallback = (call: string) => ({ messageId: 'ungatedCallback', data: { call } });
const handler = (body: string) => `const handleSave = async () => {\n${body}\n};`;
const effect = (body: string, cleanup: string) =>
  `useEffect(() => {\n  let isCancelled = false;\n${body}\n  return () => {\n${cleanup}\n  };\n}, [request]);`;

typescriptRuleTester().run('navigate-while-visit-is-current', navigateWhileVisitIsCurrent, {
  valid: [
    { name: 'a move with no request before it', code: handler("router.push('/x');") },
    { name: 'a move before the request', code: handler("router.push(next);\nawait save();") },
    { name: 'a move inside a current-visit check', code: handler('const visit = beginVisit();\nawait save();\nif (visit.isCurrent()) {\n  navigate(next);\n}') },
    { name: 'a move after an early return once the visit ended', code: handler('const visit = beginVisit();\nawait save();\nif (!visit.isCurrent()) return;\nnavigate(next);') },
    { name: 'a move in the else branch of a check that the visit ended', code: handler('await save();\nif (!visit.isCurrent()) {\n  return;\n} else {\n  navigate(next);\n}') },
    { name: 'a move that takes the visit', code: handler('const visit = beginVisit();\nawait save();\nnavigateTo(next, visit);') },
    { name: 'a move a visit helper calls back', code: handler('const result = await save();\nfinishDashboardTemplateRun(result, visit, () => navigate(next));') },
    {
      name: 'a move after a save that is null once the visit ended',
      code: handler('const saved = await saveTemplateForVisit(visit, values);\nif (!saved) return;\nrouter.push(next);'),
    },
    {
      name: 'a move the handler makes wherever the user went, by name',
      code: handler('const result = await register();\nmoveOnAfterAnAccountChange(() => router.replace(next));'),
    },
    { name: 'a synchronous handler', code: 'const handleClick = () => { navigate(next); };' },
    { name: 'a call that does not move the user', code: handler("await save();\ntoast.success('Saved');") },
    {
      name: 'a sign-in redirect in a .then() callback that checks the visit',
      code: 'load().then(() => {\n  if (visit.isCurrent()) navigateToLoginWithReturnPath(next);\n});',
    },
    {
      name: 'a checkout redirect in a .then() callback that returns once the visit ended',
      code: 'refresh().then(() => {\n  if (!visit.isCurrent()) return;\n  startBillingCheckout(plan);\n});',
    },
    { name: 'a move in a .then() callback that takes the visit', code: 'save().then(() => navigateTo(next, visit));' },
    {
      name: 'a move in a .then() callback the user moves on from wherever they went',
      code: 'register().then(() => moveOnAfterAnAccountChange(() => router.replace(next)));',
    },
    {
      name: 'a redirect in an effect callback that returns once the cleanup cancelled it',
      code: effect(
        '  load().then((result) => {\n    if (isCancelled) return;\n    router.replace(result.path);\n  });',
        '    isCancelled = true;',
      ),
    },
    {
      name: 'a redirect in an effect callback only while the cleanup has not cancelled it',
      code: effect('  load().then((result) => {\n    if (!isCancelled) router.replace(result.path);\n  });', '    isCancelled = true;'),
    },
    { name: 'a .catch() that passes on a function that does not move the user', code: 'save().catch(reportError);' },
    { name: 'a .then() callback that does not move the user', code: "save().then(() => toast.success('Saved'));" },
  ],
  invalid: [
    { name: 'router.push after a request', code: handler('await save();\nrouter.push(next);'), errors: [ungated('router.push')] },
    {
      name: 'a checkout redirect after a request, in a function expression',
      code: 'const handleUpgradeClick = async function () {\n  await refresh();\n  startBillingCheckout(plan);\n};',
      errors: [ungated('startBillingCheckout')],
    },
    {
      name: 'a move in the branch taken once the visit ended',
      code: handler('const visit = beginVisit();\nawait save();\nif (!visit.isCurrent()) {\n  navigate(next);\n}'),
      errors: [ungated('navigate')],
    },
    {
      name: 'a move after an early return on another condition',
      code: handler('await save();\nif (!saved) return;\nrouter.replace(next);'),
      errors: [ungated('router.replace')],
    },
    {
      name: 'each ungated move',
      code: handler('await save();\nnavigateToLoginWithReturnPath(next);\nhandleAccessFailure(error);'),
      errors: [ungated('navigateToLoginWithReturnPath'), ungated('handleAccessFailure')],
    },
    {
      name: 'a sign-in redirect in a .then() callback',
      code: 'load().then(() => navigateToLoginWithReturnPath(next));',
      errors: [ungatedCallback('navigateToLoginWithReturnPath')],
    },
    {
      name: 'a checkout redirect in a .then() callback of a synchronous handler',
      code: 'const handleUpgradeClick = () => {\n  refresh().then(() => {\n    startBillingCheckout(plan);\n  });\n};',
      errors: [ungatedCallback('startBillingCheckout')],
    },
    {
      name: 'a sign-in redirect passed to .catch() by name',
      code: 'load().catch(handleAccessFailure);',
      errors: [ungatedCallback('handleAccessFailure')],
    },
    {
      name: 'a move in a .finally() callback',
      code: 'save().finally(() => router.push(next));',
      errors: [ungatedCallback('router.push')],
    },
    {
      name: 'a move in a .then() callback behind a visit check made before the request settled',
      code: 'if (visit.isCurrent()) {\n  save().then(() => router.push(next));\n}',
      errors: [ungatedCallback('router.push')],
    },
    {
      name: 'a redirect in an effect callback whose flag the cleanup never sets',
      code: effect(
        '  load().then((result) => {\n    if (isCancelled) return;\n    router.replace(result.path);\n  });',
        '    controller.abort();',
      ),
      errors: [ungatedCallback('router.replace')],
    },
    {
      name: 'a move in a .then() callback after an await, reported once',
      code: handler('await save();\nrefresh().then(() => router.push(next));'),
      errors: [ungated('router.push')],
    },
  ],
});
