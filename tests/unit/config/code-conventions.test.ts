import { ESLint } from 'eslint';
import { describe, expect, expectTypeOf, it } from 'vitest';

import { DEV_TEST_USERS } from '@/lib/auth/devUsers';
import { queryKeys } from '@/lib/queryKeys';
import { E2E_TEMPLATE_API_SLUGS, E2E_TEMPLATE_PAGES } from '../../../scripts/eslint-rules/code-conventions.mjs';
import type { apiJson, apiRequest, fetchFromThePageUnderTest } from '../../e2e/support/api-requests';
import { onlyElement } from '../../support/elements';

const eslint = new ESLint({ cwd: process.cwd() });

async function reportsOf(ruleId: string, filePath: string, code: string): Promise<string[]> {
  const result = onlyElement(await eslint.lintText(code, { filePath }));
  return result.messages.filter((message) => message.ruleId === ruleId).map((message) => message.message);
}

type Case = { name: string; file: string; code: string; refusal: string | null };

const refused = (name: string, file: string, code: string, refusal: string): Case => ({ name, file, code, refusal });
const allowed = (name: string, file: string, code: string): Case => ({ name, file, code, refusal: null });

async function expectCase({ file, code, refusal }: Case, ruleId: string) {
  const reports = await reportsOf(ruleId, file, code);
  if (refusal === null) expect(reports).toEqual([]);
  else expect(reports).toEqual([expect.stringContaining(refusal)]);
}

const APP = 'src/components/Sample.tsx';
const API = 'functions/api/handlers/sample.ts';

const APP_CASES: Case[] = [
  refused('a billing redirect flag from useState', APP, 'const [isStartingCheckout, setIsStartingCheckout] = useState(false);', 'useRedirectPending()'),
  refused('a portal flag from React.useState', APP, 'const [isOpeningPortal, setIsOpeningPortal] = React.useState(false);', 'useRedirectPending()'),
  allowed('a billing redirect flag from useRedirectPending', APP, 'const [isStartingCheckout, setIsStartingCheckout] = useRedirectPending();'),
  refused('react-markdown outside MarkdownBlock', APP, "import ReactMarkdown from 'react-markdown';", '<MarkdownBlock>'),
  allowed('react-markdown in MarkdownBlock', 'src/components/shared/MarkdownBlock.tsx', "import ReactMarkdown from 'react-markdown';"),
  refused('the catalog loaded by a page that does not show it', 'src/views/Pricing.tsx', 'useTemplateLists({ catalog: true, workspace: false });', 'public catalog'),
  allowed('the catalog loaded by the Template Library hook', 'src/hooks/useTemplateLibrary.ts', 'useTemplateLists({ catalog: true, workspace: false });'),
  refused('the Template Library on a page with no tested loading and failed states', 'src/views/Pricing.tsx', "import { useTemplateLibrary } from '@/hooks/useTemplateLibrary';", 'CatalogLoadError'),
  allowed('the Template Library on the categories page', 'src/views/Categories.tsx', "import { useTemplateLibrary } from '@/hooks/useTemplateLibrary';"),
  refused('a storage listener outside the theme and the session', APP, "window.addEventListener('storage', handle);", 'subscribeToThemeChanges()'),
  allowed('the theme listening for storage events', 'src/lib/theme.ts', "target.addEventListener('storage', handleStorage);"),
  refused('a refetch of inactive queries', APP, 'queryClient.refetchQueries({ queryKey });', "type: 'active'"),
  allowed('a refetch of active queries', APP, "queryClient.refetchQueries({ queryKey, type: 'active' });"),
  refused('an onError that rewrites the image src', APP, '<img onError={(event) => { event.currentTarget.src = fallback; }} />;', 'local fallback'),
  refused('a third-party placeholder image', APP, "const image = 'https://placehold.co/600x400';", 'placeholder'),
  refused('the SVG placeholder', 'src/lib/seo/sample.ts', "const image = '/placeholder.svg';", 'placeholder'),
  refused('the old placeholder brand', APP, 'export const Title = () => <h1>Checklist App</h1>;', 'APP_BRAND_NAME'),
  refused('a Changelog query key spelled out', APP, "useQuery({ queryKey: ['checklist-run-history', runId] });", 'queryCache.ts'),
  allowed('a Changelog query key in queryCache.ts', 'src/lib/queryCache.ts', "const key = ['checklist-run-history', runId];"),
  refused('an inline progress percentage', APP, 'const percent = Math.round((completed / total) * 100);', 'toProgressPercent()'),
  allowed('the progress percentage in progress.ts', 'src/lib/progress.ts', 'const percent = Math.round((completed / total) * 100);'),
  refused('the clipboard in a route file', 'src/app/sample/page.tsx', "navigator.clipboard.writeText('x');", 'copyTextToClipboard'),
  refused('the clipboard in server code', 'src/server/sample.ts', "navigator.clipboard.writeText('x');", 'copyTextToClipboard'),
  allowed('the clipboard in clipboard.ts', 'src/lib/clipboard.ts', "navigator.clipboard.writeText('x');"),
  refused('a control hidden until hover', APP, '<button className="opacity-0 group-hover:opacity-100">x</button>;', 'keyboard focus'),
  refused('a hover control shown on focus but not on touch screens', APP, "const reveal = 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100';", 'keyboard focus'),
  allowed(
    'a hover control shown on focus and on touch screens',
    APP,
    "const reveal = 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100';",
  ),
  allowed('a hover control hidden only where the device can hover', APP, "const reveal = '[@media(hover:hover)]:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100';"),
  allowed('a pointer-only duplicate of a visible control', APP, "const overlay = 'opacity-0 group-hover:opacity-100 [@media(hover:none)]:hidden';"),
  refused('a hard-coded link without its slash', APP, '<Link href="/login">Log in</Link>;', 'route builders'),
  refused('a hard-coded link in an expression', APP, "<Link href={'/pricing?x=1'}>Pricing</Link>;", 'route builders'),
  refused('a hard-coded router destination', APP, "router.push('/dashboard/runs');", 'route builders'),
  refused('a hard-coded return path', APP, "navigate(withReturnPath('/login', returnPath));", 'route builders'),
  refused('a hard-coded link in a nav item', APP, "const item = { href: '/about', label: 'About' };", 'route builders'),
  allowed('a link a route builder gives', APP, '<Link href={buildLoginPath()}>Log in</Link>;'),
  allowed('a link to another site', APP, '<a href="https://example.com/">Example</a>;'),
];

const privateQueryKinds = Object.values(queryKeys).map((build) => build('user', 'scope')[0]);

const API_CASES: Case[] = [
  refused('a session lookup that may refresh', API, 'await auth.api.getSession({ headers });', 'disableRefresh'),
  allowed('a session lookup that never refreshes', API, 'await auth.api.getSession({ headers, query: { disableRefresh: true } });'),
  refused('the active-run limit read outside its module', API, 'const limit = entitlements.limits.maxActiveRuns;', 'active-run-limit.ts'),
  allowed('the active-run limit in its module', 'functions/api/utils/active-run-limit.ts', 'const limit = entitlements.limits.maxActiveRuns;'),
  refused('a limit_reached response built in a handler', API, "return Response.json({ error: 'x', code: 'limit_reached' }, { status: 403 });", 'limitReachedResponse()'),
  refused('upgrade text written in a handler', API, "const error = 'Upgrade to Pro to save more Templates.';", 'limitReachedResponse()'),
  allowed('a limit response in limit-reached.ts', 'functions/api/utils/limit-reached.ts', "const body = { code: 'limit_reached' };"),
  refused('a run start state reimplemented in a handler', API, 'function resetCompletionState(sections: unknown[]) { return sections; }', 'resetRunCompletionState()'),
  refused('an inline progress percentage in the API', 'functions/api/utils/sample.ts', 'const progress = Math.round((completed / total) * 100);', 'toProgressPercent()'),
  refused('the SVG placeholder in the API', API, "const image = '/placeholder.svg';", 'placeholder'),
];

const SCRIPT_CASES: Case[] = [
  refused('npx named as a command in a script', 'scripts/sample.mjs', "spawn('npx', ['wrangler']);", 'run-tool.mjs'),
  refused('pnpm named as a command in a browser test helper', 'tests/e2e/support/sample.ts', "execFileSync('pnpm.cmd', ['exec', 'tsx']);", 'run-tool.mjs'),
  refused('npx named as a command in an integration test', 'tests/integration/sample.test.ts', 'spawn(`npx`, ["wrangler"]);', 'run-tool.mjs'),
  allowed('pnpm in run-tool.mjs', 'scripts/lib/run-tool.mjs', 'return { command: "pnpm", args, options: {} };'),
  allowed('pnpm in a message', 'scripts/sample.mjs', 'console.log("Run pnpm install first");'),
  refused('a Stripe key read from env in a Stripe script', 'scripts/stripe/sample.mjs', 'const key = env.STRIPE_SECRET_KEY;', 'resolveTestSecretKey()'),
  refused('the dedicated test key read from env', 'scripts/stripe/sample.mjs', 'const key = process.env.STRIPE_TEST_SECRET_KEY;', 'resolveTestSecretKey()'),
  allowed('a Stripe key read in _env.mjs', 'scripts/stripe/_env.mjs', 'const key = env.STRIPE_SECRET_KEY;'),
  refused('a hard-coded localhost port in a script', 'scripts/stripe/sample.mjs', "const url = 'http://localhost:8788/api/stripe/webhook';", 'dev session'),
];

const SPEC = 'tests/e2e/sample.spec.ts';
const PAGE_FETCH_HELPER = 'tests/e2e/support/api-requests.ts';

const BROWSER_TEST_CASES: Case[] = [
  refused('a fetch inside page.evaluate', SPEC, "await page.evaluate(async (url) => (await fetch(url, { method: 'POST' })).json(), apiUrl);", 'apiRequest()'),
  refused('window.fetch inside evaluate on another tab', SPEC, "await tab.evaluate(() => window.fetch('/api/x'));", 'fetchFromThePageUnderTest()'),
  refused('globalThis.fetch inside evaluateHandle', 'tests/e2e/support/sample.ts', "await page.evaluateHandle(() => globalThis.fetch('/api/w'));", 'apiRequest()'),
  allowed('the page-fetch helper', SPEC, "const { status } = await fetchFromThePageUnderTest(page, '/api/y');"),
  allowed('an evaluate that fetches nothing', SPEC, 'await page.evaluate(() => window.scrollTo(0, 0));'),
  allowed('a routed request passed through', SPEC, 'await route.fulfill({ response: await route.fetch() });'),
  allowed("Playwright's request API", SPEC, "await page.request.fetch('/api/z');"),
  allowed('the in-page fetch in its helper', PAGE_FETCH_HELPER, 'export const sendFromThePage = (page, to) => page.evaluate(async (url) => (await fetch(url)).status, to);'),
  allowed('an in-page fetch in an integration test, which has no page', 'tests/integration/sample.test.ts', "await page.evaluate(() => fetch('/api/x'));"),
  refused('a Template page nothing seeds', SPEC, "await page.goto('/profile/admin/old-slug?x=1');", 'E2E_TEMPLATE_PAGES'),
  refused('a seeded slug with more after it', SPEC, "await page.goto('/profile/admin/sample-technical-seo-audit-checklist-v2/');", 'E2E_TEMPLATE_PAGES'),
  refused('an unseeded Template in an absolute URL', SPEC, "const url = 'https://serplists.com/profile/jane/unseeded-checklist/';", 'E2E_TEMPLATE_PAGES'),
  refused('an unseeded Template in a template literal', SPEC, 'await page.goto(`${origin}/profile/serp/unbundled-checklist/`);', 'E2E_TEMPLATE_PAGES'),
  refused('an API slug nothing seeds', SPEC, "if (path === '/api/templates/slug/old-slug') {}", 'E2E_TEMPLATE_API_SLUGS'),
  refused('an API slug only the bundle has, which the API never answers', SPEC, "if (path === '/api/templates/slug/ultimate-camping-checklist') {}", 'E2E_TEMPLATE_API_SLUGS'),
  allowed('a Template page built from a Template the test made', SPEC, 'await page.goto(`/profile/admin/${created.slug}/`);'),
  allowed('a Template page missing on purpose', SPEC, "await page.goto('/profile/serp/no-such-template/');"),
  allowed('an owner missing on purpose', SPEC, "await page.goto('/profile/no-such-user/sample-technical-seo-audit-checklist/');"),
  allowed('an API slug missing on purpose', SPEC, "if (path === '/api/templates/slug/no-such-slug') {}"),
  ...E2E_TEMPLATE_PAGES.map((page) => allowed(`the listed Template page ${page}`, SPEC, `await page.goto('/profile/${page}/');`)),
  ...E2E_TEMPLATE_API_SLUGS.map((slug) => allowed(`the listed API slug ${slug}`, SPEC, `if (path === '/api/templates/slug/${slug}') {}`)),
];

describe('code conventions in src/ (serplists/restricted-code with APP_CONVENTIONS)', () => {
  it.each(APP_CASES)('$name', (sample) => expectCase(sample, 'serplists/restricted-code'));

  it.each(privateQueryKinds)('refuses the private query key %j outside src/lib/queryKeys.ts, so every one goes through queryKeys', async (kind) => {
    await expectCase(refused(kind, APP, `useQuery({ queryKey: ['${kind}', userId] });`, 'queryKeys'), 'serplists/restricted-code');
    await expectCase(allowed(kind, 'src/lib/queryKeys.ts', `const key = ['${kind}', userId];`), 'serplists/restricted-code');
  });
});

describe('code conventions in functions/ (serplists/restricted-code with API_CONVENTIONS)', () => {
  it.each(API_CASES)('$name', (sample) => expectCase(sample, 'serplists/restricted-code'));

  it.each(DEV_TEST_USERS.map((user) => user.email))('refuses the seeded persona email %s in API code', (email) =>
    expectCase(refused(email, API, `if (user.email === '${email}') grantPro();`, 'persona'), 'serplists/restricted-code'),
  );
});

describe('code conventions in scripts/ and the browser and integration tests', () => {
  it.each(SCRIPT_CASES)('$name', (sample) => expectCase(sample, 'serplists/restricted-code'));
});

describe('code conventions in the browser tests (serplists/restricted-code with BROWSER_TEST_CONVENTIONS)', () => {
  it.each(BROWSER_TEST_CASES)('$name', (sample) => expectCase(sample, 'serplists/restricted-code'));

  it('names request helpers that tests/e2e/support/api-requests.ts exports', () => {
    expectTypeOf<typeof apiRequest>().toBeFunction();
    expectTypeOf<typeof apiJson>().toBeFunction();
    expectTypeOf<typeof fetchFromThePageUnderTest>().toBeFunction();
  });
});

describe('toasts on src/ (no-restricted-imports)', () => {
  it.each([
    refused('a toast store whose renderer the app never mounts', APP, "import { useToast } from '@/hooks/use-toast';", "Import { toast } from 'sonner'"),
    refused('the Radix toast', APP, "import * as Toast from '@radix-ui/react-toast';", "Import { toast } from 'sonner'"),
    allowed('sonner, whose Toaster the providers mount', APP, "import { toast } from 'sonner';"),
  ])('$name', (sample) => expectCase(sample, 'no-restricted-imports'));
});

describe('the navigation rule on src/', () => {
  it('refuses a handler that navigates after a request without checking the page visit', () =>
    expectCase(
      refused('ungated', 'src/views/Sample.tsx', 'const handleSave = async () => { await save(); router.push(next); };', 'usePageVisit()'),
      'serplists/navigate-while-visit-is-current',
    ));
});

describe('the source-text rule on tests', () => {
  it.each([
    refused('a unit test', 'tests/unit/sample.test.ts', "readFileSync('src/app/layout.tsx', 'utf8');", 'src/app/layout.tsx'),
    refused('a test beside the code', 'src/lib/sample.test.ts', "readFileSync('functions/api/db.ts', 'utf8');", 'functions/api/db.ts'),
    refused('a browser spec', 'tests/e2e/sample.spec.ts', "readFileSync('src/app/layout.tsx', 'utf8');", 'src/app/layout.tsx'),
    allowed('a script, which may read the code it builds', 'scripts/sample.mjs', "readFileSync('src/app/layout.tsx', 'utf8');"),
  ])('applies to $name', (sample) => expectCase(sample, 'serplists/no-source-text-reads'));
});
