// Architecture rules for `pnpm run deps:check`. See ARCHITECTURE.md for the layer map.
// Existing violations are recorded in .dependency-cruiser-known-violations.json and
// tolerated; anything new fails. Fix violations rather than re-baselining.

// Framework-free modules that both the React app and the Pages Functions API may import.
// Only add a module here after confirming it has no React, DOM, or browser-only imports.
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
];

// Pages Functions entry points (file-based routes).
const PAGES_ROUTES =
  "^functions/(api/\\[\\[route\\]\\]\\.ts$|sitemap\\.xml\\.ts$|sitemaps/|categories/|profile/|templates/)";

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "api-imports-only-shared-src",
      severity: "error",
      comment:
        "functions/ (the API) may only import framework-free modules from src/ listed in SHARED_FROM_SRC " +
        "in .dependency-cruiser.cjs. Move the logic into src/lib/schemas/ or another pure module and add it there.",
      from: { path: "^functions/" },
      to: { path: "^src/", pathNot: SHARED_FROM_SRC },
    },
    {
      name: "shared-src-stays-framework-free",
      severity: "error",
      comment:
        "Modules shared with the API must not depend on React, UI, contexts, hooks, or the browser API client. " +
        "Keep shared code pure (types, Zod schemas, string helpers).",
      from: { path: SHARED_FROM_SRC },
      to: { path: ["^node_modules/(react|react-dom|react-router-dom)/", "^src/(components|pages|contexts|hooks|features)/", "^src/lib/api\\.ts$"] },
    },
    {
      name: "app-does-not-import-api-runtime",
      severity: "error",
      comment:
        "The React app must not import server code from functions/. Call the API through src/lib/api.ts; " +
        "share types or schemas via src/lib/schemas/.",
      from: { path: "^src/" },
      to: { path: "^functions/" },
    },
    {
      name: "screens-do-not-call-transport",
      severity: "error",
      comment:
        "Pages and components must not call src/lib/api.ts directly (type-only imports are fine). Put the call in a " +
        "feature hook or context (src/features/*, src/contexts/*) and pass data/actions down. " +
        "See docs/exec-plans/active/ui-decoupling.md.",
      from: { path: "^src/(pages|components)/" },
      to: { path: "^src/lib/api\\.ts$", dependencyTypesNot: ["type-only"] },
    },
    {
      name: "ui-primitives-stay-presentational",
      severity: "error",
      comment:
        "src/components/ui/ holds design-system primitives. They must not depend on app state, features, pages, " +
        "or the API client. Compose them in a feature component instead.",
      from: { path: "^src/components/ui/" },
      to: { path: "^src/(contexts|features|pages|hooks/use(?!-mobile))|^src/lib/api\\.ts$" },
    },
    {
      name: "api-utils-do-not-import-handlers",
      severity: "error",
      comment:
        "functions/api/utils/ is the shared service layer; handlers depend on it, never the reverse. " +
        "Move the shared logic from the handler into a utils module.",
      from: { path: "^functions/api/utils/" },
      to: { path: "^functions/api/handlers/" },
    },
    {
      name: "db-schema-is-a-leaf",
      severity: "error",
      comment: "db/schema/ defines tables only and must not import application code.",
      from: { path: "^db/schema/" },
      to: { path: "^(src|functions)/" },
    },
    {
      name: "production-code-does-not-import-tests",
      severity: "error",
      comment: "Move shared fixtures out of tests/ or keep them test-only.",
      from: { path: "^(src|functions|db)/", pathNot: "\\.test\\.tsx?$" },
      to: { path: "^tests/" },
    },
    {
      name: "production-code-does-not-import-dev-dependencies",
      severity: "error",
      comment:
        "Runtime code must not import devDependencies (they are not guaranteed at runtime). " +
        "Type-only imports are fine. Move the package to dependencies if it is really needed at runtime.",
      from: { path: "^(src|functions)/", pathNot: "\\.test\\.tsx?$" },
      to: { dependencyTypes: ["npm-dev"], dependencyTypesNot: ["type-only"] },
    },
    {
      name: "app-code-is-reachable",
      severity: "error",
      comment:
        "This module is not reachable from src/main.tsx, so it is dead code that agents may copy or 'fix' by mistake. " +
        "Delete it, or import it where it is needed. (Unused shadcn primitives in src/components/ui/ are exempt.)",
      from: { path: "^src/main\\.tsx$" },
      to: {
        path: "^src/",
        pathNot: ["\\.d\\.ts$", "\\.test\\.tsx?$", "^src/components/ui/", "^src/hooks/use-mobile\\.tsx$", ...SHARED_FROM_SRC],
        reachable: false,
      },
    },
    {
      name: "api-code-is-reachable",
      severity: "error",
      comment:
        "This module is not reachable from any Pages Functions route, so it is dead code. Delete it or import it where needed.",
      from: { path: PAGES_ROUTES },
      to: { path: "^functions/", pathNot: ["\\.json$", PAGES_ROUTES], reachable: false },
    },
    {
      name: "no-circular",
      severity: "error",
      comment: "Circular imports make modules impossible to reason about in isolation. Extract the shared part into its own module.",
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: "(^|/)(node_modules|dist|coverage|\\.wrangler)/|\\.generated\\.json$" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      extensions: [".ts", ".tsx", ".js", ".mjs", ".cjs", ".json"],
    },
  },
};
