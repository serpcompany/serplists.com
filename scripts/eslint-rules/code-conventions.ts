export type CodeConvention = { selector: string; message: string; owners?: string[] };

const text = (pattern: string) =>
  `:matches(Literal[value=${pattern}], TemplateElement[value.raw=${pattern}], JSXText[value=${pattern}])`;

const SLASH = "\\x2F";

const HIDDEN_UNTIL_HOVER = "(?=.*(?:^|\\s)(?:\\S+:)?opacity-0(?:\\s|$))(?=.*group-hover:opacity-100)";
const NOT_A_HOVER_ONLY_DUPLICATE = "(?!.*\\[@media\\(hover:none\\)\\]:hidden)";
const SHOWN_ON_FOCUS_AND_TOUCH =
  "(?=.*focus-(?:within|visible):opacity-100)(?=.*(?:\\[@media\\(hover:none\\)\\]:opacity-100|\\[@media\\(hover:hover\\)\\]:opacity-0))";
const HOVER_ONLY_CONTROL = `/^${HIDDEN_UNTIL_HOVER}${NOT_A_HOVER_ONLY_DUPLICATE}(?!${SHOWN_ON_FOCUS_AND_TOUCH})/`;

const PRIVATE_QUERY_KINDS = [
  "incoming-team-invites",
  "agent-keys",
  "team-members",
  "team-invites",
  "team-activity",
  "archived-templates",
  "archived-runs",
];

const PERSONA_EMAILS = ["checklists@serp.co", "admin@test.com", "john@test.com", "jane@test.com", "bob@test.com"];

const escaped = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const PROGRESS_PERCENT: CodeConvention = {
  selector:
    "CallExpression[callee.object.name='Math'][callee.property.name=/^(?:round|floor|ceil)$/] " +
    "BinaryExpression[operator='/']:matches([left.name=/completed/i], [left.property.name=/completed/i])" +
    ":matches([right.name=/total/i], [right.property.name=/total/i])",
  message:
    "Compute a progress percentage with toProgressPercent() from src/lib/progress.ts: rounding turns 199 of 200 into " +
    "100%, which reads as done, and every calculator must agree on the client and the server.",
  owners: ["src/lib/progress.ts"],
};

const PLACEHOLDER_IMAGES: CodeConvention = {
  selector: text("/placehold\\.co|placeholder\\.svg/"),
  message:
    "Point no image at a placeholder: placehold.co is a third-party host every view would request, and " +
    "public/placeholder.svg does not exist (social sites render no SVG previews). Render a local fallback, and use " +
    "SITE_SOCIAL_IMAGE from src/lib/publicPageMeta.ts for link previews.",
};

const ORGANIZATION_CONSOLE_PATHS: CodeConvention = {
  selector: text(`/${SLASH}dashboard${SLASH}organization(?:${SLASH}|$)/`),
  message:
    "Build an Organization's console paths with the builders in src/lib/consoleRoutes.ts: pass " +
    "organizationConsole(organizationId) to buildConsoleTemplatesPath() and the rest, and switch context with " +
    "buildEquivalentConsolePath(). They encode the id, keep each URL canonical, and are the paths parseConsoleRoute() " +
    "reads back to decide the Organization a page shows.",
  owners: ["src/lib/consoleRoutes.ts"],
};

export const APP_CONVENTIONS: CodeConvention[] = [
  {
    selector:
      "VariableDeclarator[id.type='ArrayPattern'][id.elements.0.name=/^is\\w*(?:Checkout|Portal|Redirect)\\w*$/]" +
      ":matches([init.callee.name='useState'], [init.callee.property.name='useState'])",
    message:
      "A flag that stays on while the browser leaves for Stripe must come from useRedirectPending() " +
      "(src/hooks/useRedirectPending.ts), which clears it when Back restores the page from the back/forward cache. " +
      "A useState flag stays on, and its button stays disabled.",
  },
  {
    selector: "ImportDeclaration[source.value='react-markdown']",
    message:
      "Render markdown with <MarkdownBlock> from src/components/shared/MarkdownBlock.tsx, the one module that imports " +
      "react-markdown, so every markdown block gets the same plugins, link safety and prose classes.",
    owners: ["src/components/shared/MarkdownBlock.tsx"],
  },
  {
    selector: "CallExpression[callee.name='useTemplateLists'] > ObjectExpression > Property[key.name='catalog'][value.value=true]",
    message:
      "Only the pages that show the public catalog load it, through useTemplateLibrary() (and the dashboard): an " +
      "edge-cache miss reads every public Template from D1 (docs/design-docs/d1-cost.md).",
    owners: ["src/hooks/useTemplateLibrary.ts", "src/views/Dashboard.tsx"],
  },
  {
    selector: "ImportDeclaration[source.value=/useTemplateLibrary$/]",
    message:
      "useTemplateLibrary() lists only the bundled starter Templates until the catalog loads, and again after it fails. " +
      "A page that uses it shows its loading state and <CatalogLoadError onRetry={retryCatalog}>, with a test of both " +
      "like tests/unit/views/Categories.dom.test.tsx, and then joins this convention's owners.",
    owners: ["src/views/Categories.tsx", "src/views/CategoryDetail.tsx", "src/views/ChecklistLibrary.tsx"],
  },
  {
    selector: "CallExpression[callee.property.name='addEventListener'][arguments.0.value='storage']",
    message:
      "Only src/lib/theme.ts (the theme) and src/contexts/sessionSync.ts (the session) listen for storage events from " +
      "other tabs. Follow the theme with subscribeToThemeChanges(), so no component updates its label alone.",
    owners: ["src/lib/theme.ts", "src/contexts/sessionSync.ts"],
  },
  {
    selector: "CallExpression[callee.property.name='refetchQueries']:not(:has(Property[key.name='type'][value.value='active']))",
    message:
      "refetchQueries() without type: 'active' also refetches inactive queries, which may belong to a user who signed " +
      "out, with the new session's cookie. Use invalidateQueries(), or refetchQueries({ ..., type: 'active' }).",
  },
  {
    selector: "JSXOpeningElement[name.name='img']",
    message:
      "Render a user's image, an upload or a URL a Template names, with <UserContentImage> from " +
      "src/components/shared/UserContentImage.tsx, the one module that renders <img>: it is served as stored, since " +
      "its size is unknown and Next.js has no image optimizer on Workers here. Use next/image for the app's own images.",
    owners: ["src/components/shared/UserContentImage.tsx"],
  },
  {
    selector: "JSXAttribute[name.name='onError'] AssignmentExpression[left.type='MemberExpression'][left.property.name='src']",
    message:
      "An onError handler that sets the image's src again loops when that source fails too. Record the failure in " +
      "state and render a local fallback, as TaskImageView (src/components/shared/TaskImage.tsx) does.",
  },
  PLACEHOLDER_IMAGES,
  ORGANIZATION_CONSOLE_PATHS,
  {
    selector: text("/Checklist App/"),
    message: "The product is SERP Lists: use APP_BRAND_NAME from src/lib/brand.ts, never the old placeholder brand.",
  },
  {
    selector: "Literal[value=/^(?:checklist-run-history|history|detail)$/]",
    message:
      "Build Changelog and template detail query keys with runHistory(), templateHistoryFor(), everyTemplateHistory() " +
      "or templateDetail() from src/lib/queryCache.ts: a key spelled out elsewhere is missed when a save refreshes the " +
      "history, or when archiving or restoring a Template updates its detail page.",
    owners: ["src/lib/queryCache.ts"],
  },
  {
    selector: text(`/^(?:${PRIVATE_QUERY_KINDS.join("|")})$/`),
    message:
      "Build private query keys with queryKeys from src/lib/queryKeys.ts, which puts the user in every key: a key " +
      "spelled out elsewhere can serve one user's cached data to the next user of the tab.",
    owners: ["src/lib/queryKeys.ts"],
  },
  PROGRESS_PERCENT,
  {
    selector: "MemberExpression[property.name='clipboard']",
    message:
      "Copy with copyTextToClipboard from src/lib/clipboard.ts: it never throws and returns false when the browser " +
      "refuses. Also show the text (for share links, ShareLinkDialog) so a failed copy never loses it.",
    owners: ["src/lib/clipboard.ts"],
  },
  {
    selector: `:matches(Literal[value=${HOVER_ONLY_CONTROL}], TemplateElement[value.raw=${HOVER_ONLY_CONTROL}])`,
    message:
      "A control hidden until hover (opacity-0 with group-hover:opacity-100) must also show on keyboard focus " +
      "(focus-within or focus-visible:opacity-100) and on touch screens ([@media(hover:none)]:opacity-100), or Enter " +
      "acts on a button nobody can see. Use ROW_ACTIONS_REVEAL_CLASS from src/components/ui/hover-reveal.ts, or mark a " +
      "pointer-only duplicate of a visible control [@media(hover:none)]:hidden.",
  },
  {
    selector:
      `:matches(JSXAttribute[name.name='href'] > Literal[value=/^${SLASH}/], ` +
      `JSXAttribute[name.name='href'] > JSXExpressionContainer > Literal[value=/^${SLASH}/], ` +
      `Property[key.name='href'][value.value=/^${SLASH}/], ` +
      `CallExpression[callee.object.name=/router$/i][callee.property.name=/^(?:push|replace)$/][arguments.0.value=/^${SLASH}/], ` +
      `CallExpression[callee.name=/^(?:navigate|navigateTo|withReturnPath)$/][arguments.0.value=/^${SLASH}/])`,
    message:
      "Build internal links with the route builders in src/lib/routes.ts (buildHomePath(), buildLoginPath() and the " +
      "rest): tests/unit/lib/canonicalUrls.test.ts checks that each one gives the canonical URL, which answers without " +
      "a redirect. Nothing checks a hard-coded path.",
  },
];

export const API_CONVENTIONS: CodeConvention[] = [
  {
    selector:
      "CallExpression[callee.property.name='getSession'][callee.object.property.name='api']" +
      ":not(:has(Property[key.name='disableRefresh'][value.value=true]))",
    message:
      "Look a session up with query: { disableRefresh: true } outside the auth route, as getSessionUserId() in " +
      "functions/api/utils/session.ts does: a refresh writes the session on a read and races the auth route's own.",
  },
  {
    selector: "MemberExpression[property.name='maxActiveRuns']",
    message:
      "Check the active-run limit with the helpers in functions/api/utils/active-run-limit.ts: a route that counted its " +
      "own way left shared runs out of the count.",
    owners: ["functions/api/utils/active-run-limit.ts"],
  },
  {
    selector:
      ":matches(Property[key.name='code'][value.value='limit_reached'], Literal[value=/Upgrade to Pro/], " +
      "TemplateElement[value.raw=/Upgrade to Pro/])",
    message:
      "Build limit responses with limitReachedResponse() or personalProRequiredResponse() from " +
      "functions/api/utils/limit-reached.ts: handlers that wrote their own limit text drifted apart.",
    owners: ["functions/api/utils/limit-reached.ts"],
  },
  {
    selector:
      ":matches(FunctionDeclaration[id.name=/^reset\\w*CompletionState$/], VariableDeclarator[id.name=/^reset\\w*CompletionState$/])",
    message:
      "Start a run's state with resetRunCompletionState() from functions/api/utils/template-reconciliation.ts: the web " +
      "and MCP copies drifted apart and started runs differently.",
    owners: ["functions/api/utils/template-reconciliation.ts"],
  },
  {
    selector: text(`/${PERSONA_EMAILS.map(escaped).join("|")}/i`),
    message:
      "API code never names a seeded persona's email (src/lib/auth/devUsers.ts): anyone can register those addresses " +
      "outside local development, so code that grants something by address grants it to them.",
  },
  PLACEHOLDER_IMAGES,
  { ...ORGANIZATION_CONSOLE_PATHS, owners: [] },
  { ...PROGRESS_PERCENT, owners: [] },
];

const TOOL_SHIMS: CodeConvention = {
  selector:
    ":matches(Literal[value=/^(?:npx|pnpm|pnpx)(?:\\.cmd|\\.exe)?$/], TemplateElement[value.raw=/^(?:npx|pnpm|pnpx)(?:\\.cmd|\\.exe)?$/])",
  message:
    "npx and pnpm are .cmd shims on Windows that fail to start without a shell. Launch local tools (wrangler, next, ...) " +
    "with execTool() or spawnTool(), and scripts with execScript() or buildScriptInvocation(), from scripts/lib/run-tool.ts.",
  owners: ["scripts/lib/run-tool.ts"],
};

const STRIPE_SECRET_KEY_NAME = "/^STRIPE_(?:\\w+_)?SECRET_KEY(?:_\\w+)?$/";

export const SCRIPT_CONVENTIONS: CodeConvention[] = [
  TOOL_SHIMS,
  {
    selector: `MemberExpression:matches([property.name=${STRIPE_SECRET_KEY_NAME}], [property.value=${STRIPE_SECRET_KEY_NAME}])`,
    message:
      "Read Stripe secret keys only through resolveTestSecretKey() or resolveLiveSecretKey() in " +
      "scripts/stripe/_env.ts, so every script prefers the dedicated test key and takes a live key only when it is one.",
    owners: ["scripts/stripe/_env.ts"],
  },
  {
    selector: text("/localhost:\\d/"),
    message:
      "A hard-coded localhost port misses the port this checkout's dev:all picked. Take it from the dev session " +
      "(readDevSession() in scripts/dev-auto-lib.ts), or for Stripe from resolveWebhookForwardTarget() in " +
      "scripts/stripe/_listen-target.ts.",
  },
];

export const E2E_TEMPLATE_PAGES = [
  "admin/sample-technical-seo-audit-checklist",
  "admin/internal-publishing-checklist",
  "admin/shared-growth-launch-checklist",
  "jane/client-reporting-qa-checklist",
  "serp-growth-team/shared-growth-launch-checklist",
  "local-seo-client-team/client-reporting-qa-checklist",
  "serp/ultimate-camping-checklist",
  "serp/full-website-launch-qa-checklist",
];

export const E2E_TEMPLATE_API_SLUGS = ["sample-technical-seo-audit-checklist"];

export const DELIBERATELY_MISSING_PREFIX = "no-such-";

const NAME = "[A-Za-z0-9_-]+";
const END_OF_NAME = "(?![A-Za-z0-9_$-])";
const NOT_MISSING_ON_PURPOSE = `(?!${DELIBERATELY_MISSING_PREFIX})`;
const noneOf = (names: readonly string[]) => `(?!(?:${names.map((name) => name.replaceAll("/", SLASH)).join("|")})${END_OF_NAME})`;
const UNSEEDED_TEMPLATE_PAGE =
  `/${SLASH}profile${SLASH}${noneOf(E2E_TEMPLATE_PAGES)}` +
  `${NOT_MISSING_ON_PURPOSE}${NAME}${SLASH}${NOT_MISSING_ON_PURPOSE}${NAME}${END_OF_NAME}/`;
const UNSEEDED_TEMPLATE_SLUG =
  `/${SLASH}templates${SLASH}slug${SLASH}${noneOf(E2E_TEMPLATE_API_SLUGS)}${NOT_MISSING_ON_PURPOSE}${NAME}${END_OF_NAME}/`;

export const INTEGRATION_TEST_CONVENTIONS: CodeConvention[] = [TOOL_SHIMS];

export const BROWSER_TEST_CONVENTIONS: CodeConvention[] = [
  TOOL_SHIMS,
  {
    selector:
      "CallExpression[callee.property.name=/^evaluate(?:Handle)?$/] CallExpression:matches([callee.name='fetch'], " +
      "[callee.object.name=/^(?:window|globalThis|self)$/][callee.property.name='fetch'])",
    message:
      "Set up and read data with apiRequest() or apiJson() from tests/e2e/support/api-requests.ts, not a fetch inside " +
      "page.evaluate(). If how the browser itself sends the request is what the test checks (a CORS preflight, say), " +
      "send it with fetchFromThePageUnderTest() from the same file.",
    owners: ["tests/e2e/support/api-requests.ts"],
  },
  {
    selector: `:matches(${text(UNSEEDED_TEMPLATE_PAGE)}, ${text(UNSEEDED_TEMPLATE_SLUG)})`,
    message:
      "The browser tests open only the Templates in E2E_TEMPLATE_PAGES (and ask the API only for E2E_TEMPLATE_API_SLUGS) " +
      "in scripts/eslint-rules/code-conventions.ts, which tests/unit/e2e/seeded-template-paths.test.ts checks that " +
      "`seed-test` (db/seeds/local.ts) creates or src/data bundles. Use one of them, add a seeded or bundled Template to " +
      "the list, or create one in the test. A path that must be missing names its user or Template with the no-such- " +
      "prefix, as in /profile/serp/no-such-template/.",
  },
];
