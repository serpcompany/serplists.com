const SHARED_FROM_SRC = [
  "^src/lib/schemas/",
  "^src/lib/utils/clipyUrl\\.ts$",
  "^src/lib/utils/slug\\.ts$",
  "^src/lib/utils/loopbackHostname\\.ts$",
  "^src/data/publicCategories\\.ts$",
  "^src/lib/categorySlug\\.ts$",
  "^src/lib/brand\\.ts$",
  "^src/lib/publicPageMeta\\.ts$",
  "^src/lib/progress\\.ts$",
  "^src/lib/seo/siteOrigin\\.ts$",
  "^src/lib/http/urlStandard\\.ts$",
  "^src/lib/consoleRoutes\\.ts$",
];

const APP_ROUTES = "^src/app/";
const NEXT_ENTRY_FILES = "^src/(instrumentation|instrumentation-client|proxy)\\.ts$";
const APP_ENTRY_POINTS = [APP_ROUTES, NEXT_ENTRY_FILES, "^next\\.config\\.ts$"];
const SERVER_SIDE = "^src/(app|server)/";
const TESTS = "\\.test\\.tsx?$";
const API_CLIENT = "^src/lib/api(\\.ts$|/)";

const API_ROUTER = "^functions/api/\\[\\[route\\]\\]\\.ts$";
const API_HANDLERS = "^functions/api/handlers/";
const DB_MODULE = "^functions/api/db\\.ts$";
const WORKER_TYPES = "^functions/api/types\\.ts$";
const OBSERVABILITY = [
  "^functions/api/utils/logger\\.ts$",
  "^functions/api/utils/d1-profiler\\.ts$",
  "^functions/api/utils/request-context\\.ts$",
];

const layers = (text) => `${text} (ARCHITECTURE.md, Layers).`;
const rules = (section, text) => `${text} (docs/agents/code.md, ${section}).`;

const layerRule = (name, comment, from, to) => ({ name, severity: "error", comment: layers(comment), from, to });

module.exports = {
  forbidden: [
    layerRule(
      "api-imports-only-shared-src",
      "functions/ (the API) imports from src/ only the framework-free modules SHARED_FROM_SRC lists in " +
        ".dependency-cruiser.cjs. Move the logic into src/lib/schemas/ or another pure module, and list it there",
      { path: "^functions/" },
      { path: "^src/", pathNot: SHARED_FROM_SRC },
    ),
    layerRule(
      "shared-src-stays-framework-free",
      "The modules the API shares with the app (SHARED_FROM_SRC) run in the API too, so they import no React, no " +
        "Next.js and no browser API client. Keep shared code pure: types, Zod schemas, string helpers",
      { path: SHARED_FROM_SRC },
      { path: ["^node_modules/(react|react-dom|next)/", API_CLIENT] },
    ),
    layerRule(
      "app-does-not-import-api-runtime",
      "Only the app's server side (route files in src/app, and src/server) imports functions/. Views, components, " +
        "features, contexts and hooks call the API through src/lib/api.ts, and share types and schemas through " +
        "src/lib/schemas/",
      { path: "^src/", pathNot: SERVER_SIDE },
      { path: "^functions/" },
    ),
    layerRule(
      "client-code-does-not-import-server-modules",
      "src/server holds server-only code (D1, the Worker's bindings, request headers). Route files in src/app import " +
        "it (generateMetadata, route handlers); views, components, features, contexts, hooks and src/lib never do",
      { path: "^src/", pathNot: SERVER_SIDE },
      { path: "^src/server/" },
    ),
    layerRule(
      "views-import-no-route",
      "src/app holds the routes Next.js loads, and a route imports its view, never the reverse. Pass what the view " +
        "needs from its route as a prop, or move the shared code into src/lib",
      { path: "^src/views/", pathNot: TESTS },
      { path: APP_ROUTES },
    ),
    layerRule(
      "components-import-no-route-or-view",
      "Routes and views compose components, so a component imports no view and no route. Take what it needs as a " +
        "prop from the route or view that renders it, as OrganizationRouteGate takes its not-found page, or move " +
        "that part into src/components",
      { path: "^src/components/", pathNot: TESTS },
      { path: "^src/(app|views)/" },
    ),
    layerRule(
      "features-contexts-and-hooks-import-no-screen",
      "src/features, src/contexts and src/hooks hold the data and actions that components and views render, so " +
        "they import no component, view or route. Return the data and let the component render it, or move a " +
        "shared helper into src/lib",
      { path: "^src/(features|contexts|hooks)/", pathNot: TESTS },
      { path: "^src/(app|views|components)/" },
    ),
    layerRule(
      "lib-builds-on-nothing-above-it",
      "src/lib, with src/data, src/types and src/utils, is what every other layer of the app builds on, so it " +
        "imports none of them. Move what both sides need into src/lib, or take it as a parameter",
      { path: "^src/(lib|data|types|utils)/", pathNot: TESTS },
      { path: "^src/(app|views|components|features|contexts|hooks)/" },
    ),
    layerRule(
      "server-imports-no-route-or-view",
      "src/server holds the server-only code that route files call, beside the views, so it imports no route " +
        "and no view. Move what both need into src/server, src/components or src/lib",
      { path: "^src/server/", pathNot: TESTS },
      { path: "^src/(app|views)/" },
    ),
    layerRule(
      "screens-do-not-call-transport",
      "Views and components never call the API client (src/lib/api.ts, src/lib/api/) themselves; a type-only " +
        "import is fine. Put the call in a feature hook or a context (src/features/, src/contexts/) and pass its " +
        "data and actions down",
      { path: "^src/(views|components)/" },
      { path: API_CLIENT, dependencyTypesNot: ["type-only"] },
    ),
    layerRule(
      "ui-primitives-stay-presentational",
      "src/components/ui/ holds the design system's primitives, which depend on no app state, feature, hook or " +
        "API client. Compose them in a component outside src/components/ui/ instead",
      { path: "^src/components/ui/" },
      { path: ["^src/(contexts|features|hooks)/", API_CLIENT] },
    ),
    layerRule(
      "handlers-import-no-router",
      "functions/api/[[route]].ts is the API's entry: it applies CORS, rate limits, the request id and logging, " +
        "then calls a handler, so no handler imports it. Move what the handler needs into functions/api/utils/",
      { path: API_HANDLERS },
      { path: API_ROUTER },
    ),
    layerRule(
      "api-services-import-no-handler-or-router",
      "functions/api/utils/ (with better-auth.ts and env.ts) and the lookups in functions/sitemap/ and " +
        "functions/seo/ are what handlers build on, so they import no handler and not the router. Move the shared " +
        "logic out of the handler into functions/api/utils/",
      { path: "^functions/", pathNot: [API_ROUTER, API_HANDLERS, DB_MODULE, ...OBSERVABILITY] },
      { path: [API_ROUTER, API_HANDLERS] },
    ),
    layerRule(
      "db-module-builds-only-on-the-schema",
      "functions/api/db.ts opens D1 through Drizzle for every layer above it, so it imports only the tables in " +
        "db/schema/, the Worker's types and the observability modules (logger, d1-profiler, request-context). " +
        "Move code that needs more into functions/api/utils/",
      { path: DB_MODULE },
      { path: "^functions/", pathNot: [WORKER_TYPES, ...OBSERVABILITY] },
    ),
    layerRule(
      "observability-imports-no-other-api-code",
      "functions/api/utils/logger.ts, d1-profiler.ts and request-context.ts are what every other layer, db.ts " +
        "included, logs and measures through, so they import nothing else from functions/ or db/. Take what they " +
        "need as a parameter",
      { path: OBSERVABILITY },
      { path: "^(functions|db)/", pathNot: OBSERVABILITY },
    ),
    layerRule(
      "db-schema-is-a-leaf",
      "db/schema/ defines the tables every layer reads, so it imports no application code. Keep queries and " +
        "helpers in functions/api/utils/",
      { path: "^db/schema/" },
      { path: "^(src|functions)/" },
    ),
    {
      name: "production-code-does-not-import-tests",
      severity: "error",
      comment: rules(
        "Imports",
        "Code that runs in production imports a test or test support, which ships test code and ties the two " +
          "together. Move what both need beside the production code, and keep fixtures where only tests import them",
      ),
      from: { path: "^(src|functions|db)/", pathNot: TESTS },
      to: { path: "^tests/" },
    },
    {
      name: "production-code-does-not-import-dev-dependencies",
      severity: "error",
      comment: rules(
        "Imports",
        "Code that runs in production imports a devDependency, which a production install may not have. Import only " +
          "its types, or move the package to dependencies if the code really runs it",
      ),
      from: { path: "^(src|functions)/", pathNot: TESTS },
      to: { dependencyTypes: ["npm-dev"], dependencyTypesNot: ["type-only"] },
    },
    {
      name: "app-code-is-reachable",
      severity: "error",
      comment: rules(
        "Dead code",
        "No route file in src/app, file Next.js loads by name (instrumentation, proxy) or next.config.ts reaches " +
          "this module, so nothing runs it, and agents copy or 'fix' it by mistake. Delete it, import it where it is " +
          "needed, or move code only a script uses to scripts/lib",
      ),
      from: { path: APP_ENTRY_POINTS },
      to: {
        path: "^src/",
        pathNot: ["\\.d\\.ts$", TESTS, APP_ROUTES, NEXT_ENTRY_FILES],
        reachable: false,
      },
    },
    {
      name: "api-code-is-reachable",
      severity: "error",
      comment: rules(
        "Dead code",
        "No route file in src/app (the API's route handler, the sitemaps, page metadata) reaches this module, so " +
          "nothing runs it. Delete it, or import it where it is needed",
      ),
      from: { path: APP_ENTRY_POINTS },
      to: { path: "^functions/", pathNot: ["\\.json$", "\\.d\\.ts$"], reachable: false },
    },
    {
      name: "no-circular",
      severity: "error",
      comment: rules(
        "Imports",
        "These modules import each other, so neither can be read or tested alone. Move what both need into a module " +
          "of its own, which each imports",
      ),
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: "^(dist|coverage|\\.wrangler)/|\\.generated\\.json$" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      extensions: [".ts", ".tsx", ".js", ".mjs", ".cjs", ".json"],
    },
  },
};
