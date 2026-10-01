import { navigateWhileVisitIsCurrent } from '../../../scripts/eslint-rules/navigate-while-visit-is-current.mjs';
import { typescriptRuleTester } from '../../support/ruleTester';

const ungated = (call: string) => ({ messageId: 'ungated', data: { call } });
const handler = (body: string) => `const handleSave = async () => {\n${body}\n};`;

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
  ],
});
