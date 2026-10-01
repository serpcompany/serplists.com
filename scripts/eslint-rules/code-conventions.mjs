const text = (pattern) =>
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

const escaped = (value) => value.replace(/[.]/g, "\\.");

const PROGRESS_PERCENT = {
  selector:
    "CallExpression[callee.object.name='Math'][callee.property.name=/^(?:round|floor|ceil)$/] " +
    "BinaryExpression[operator='/']:matches([left.name=/completed/i], [left.property.name=/completed/i])" +
    ":matches([right.name=/total/i], [right.property.name=/total/i])",
  message:
    "Compute a progress percentage with toProgressPercent() from src/lib/progress.ts: rounding turns 199 of 200 into " +
    "100%, which reads as done, and every calculator must agree on the client and the server.",
  owners: ["src/lib/progress.ts"],
};

const PLACEHOLDER_IMAGES = {
  selector: text("/placehold\\.co|placeholder\\.svg/"),
  message:
    "Point no image at a placeholder: placehold.co is a third-party host every view would request, and " +
    "public/placeholder.svg does not exist (social sites render no SVG previews). Render a local fallback, and use " +
    "SITE_SOCIAL_IMAGE from src/lib/publicPageMeta.ts for link previews.",
};

export const APP_CONVENTIONS = [
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
      "like tests/unit/views/Categories.test.tsx, and then joins this convention's owners.",
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
    selector: "JSXAttribute[name.name='onError'] AssignmentExpression[left.type='MemberExpression'][left.property.name='src']",
    message:
      "An onError handler that sets the image's src again loops when that source fails too. Record the failure in " +
      "state and render a local fallback, as TaskImageView (src/components/shared/TaskImage.tsx) does.",
  },
  PLACEHOLDER_IMAGES,
  {
    selector: text("/Checklist App/"),
    message: "The product is SERP Lists: use APP_BRAND_NAME from src/lib/brand.ts, never the old placeholder brand.",
  },
  {
    selector: "Literal[value=/^(?:checklist-run-history|history)$/]",
    message:
      "Build Changelog query keys with runHistory(), templateHistoryFor() or everyTemplateHistory() from " +
      "src/lib/queryCache.ts: a key spelled out elsewhere is missed when a save refreshes the history.",
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

export const API_CONVENTIONS = [
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
  { ...PROGRESS_PERCENT, owners: [] },
];

const TOOL_SHIMS = {
  selector:
    ":matches(Literal[value=/^(?:npx|pnpm|pnpx)(?:\\.cmd|\\.exe)?$/], TemplateElement[value.raw=/^(?:npx|pnpm|pnpx)(?:\\.cmd|\\.exe)?$/])",
  message:
    "npx and pnpm are .cmd shims on Windows that fail to start without a shell. Launch local tools (wrangler, tsx, ...) " +
    "with execTool() or spawnTool() and pnpm with execPnpm() from scripts/lib/run-tool.mjs.",
  owners: ["scripts/lib/run-tool.mjs"],
};

export const SCRIPT_CONVENTIONS = [
  TOOL_SHIMS,
  {
    selector: "MemberExpression[property.name=/^STRIPE_(?:\\w+_)?SECRET_KEY(?:_\\w+)?$/]",
    message:
      "Read Stripe secret keys only through resolveTestSecretKey() or resolveLiveSecretKey() in " +
      "scripts/stripe/_env.mjs, so every script prefers the dedicated test key and takes a live key only when it is one.",
    owners: ["scripts/stripe/_env.mjs"],
  },
  {
    selector: text("/localhost:\\d/"),
    message:
      "A hard-coded localhost port misses the port this checkout's dev:all picked. Take it from the dev session " +
      "(readDevSession() in scripts/dev-auto-lib.mjs), or for Stripe from resolveWebhookForwardTarget() in " +
      "scripts/stripe/_listen-target.mjs.",
  },
];

export const BROWSER_AND_INTEGRATION_TEST_CONVENTIONS = [TOOL_SHIMS];
