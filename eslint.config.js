import js from "@eslint/js";
import nextVitals from "eslint-config-next/core-web-vitals";
import globals from "globals";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import {
  API_CONVENTIONS,
  APP_CONVENTIONS,
  BROWSER_TEST_CONVENTIONS,
  INTEGRATION_TEST_CONVENTIONS,
  SCRIPT_CONVENTIONS,
} from "./scripts/eslint-rules/code-conventions.mjs";
import { navigateWhileVisitIsCurrent } from "./scripts/eslint-rules/navigate-while-visit-is-current.mjs";
import { noComments } from "./scripts/eslint-rules/no-comments.mjs";
import { noExternalDataCasts } from "./scripts/eslint-rules/no-external-data-casts.mjs";
import { noSourceTextReads } from "./scripts/eslint-rules/no-source-text-reads.mjs";
import { restrictedCode } from "./scripts/eslint-rules/restricted-code.mjs";

const MAX_LINES = 500;

const turnedOff = (names) => Object.fromEntries(names.map((name) => [name, "off"]));
const NODE_MODULE_GLOBALS = {
  ...turnedOff(Object.keys(globals.browser).filter((name) => !(name in globals.nodeBuiltin))),
  ...turnedOff(Object.keys(globals.node).filter((name) => !(name in globals.nodeBuiltin))),
  ...globals.nodeBuiltin,
};

const SERPLISTS_RULES = {
  rules: {
    "navigate-while-visit-is-current": navigateWhileVisitIsCurrent,
    "no-comments": noComments,
    "no-external-data-casts": noExternalDataCasts,
    "no-source-text-reads": noSourceTextReads,
    "restricted-code": restrictedCode,
  },
};

const TEST_FILES = ["**/*.test.{ts,tsx,js,mjs}", "**/*.spec.{ts,tsx,js,mjs}", "tests/**/*.{ts,tsx,js,mjs}"];

const APP_API_SCRIPT_AND_DATABASE_CODE = [
  "src/**/*.{ts,tsx}",
  "functions/**/*.ts",
  "scripts/**/*.{js,mjs,cjs,ts,mts}",
  "db/**/*.ts",
];
const SKIPPED_TEST_MESSAGE =
  "Tests are never skipped, left as todo or fixme, or run only under a condition: a test that does not run hides " +
  "behavior that stopped working. Make it pass and run it in a suite (pnpm run test:run, test:local-d1, or the " +
  "browser tests), or delete it if another test covers the same behavior.";
const FOCUSED_TEST_MESSAGE =
  "`.only` skips every other test in the file. Remove it, and run one test with `pnpm exec vitest run <file> -t " +
  "'<name>'` or Playwright's `-g` instead.";
const TEST_API = "/^(describe|it|test|suite|bench)$/";
const TEST_API_MODIFIER = "/^(describe|serial|parallel|concurrent|sequential|shuffle)$/";
const SKIPPING_MODIFIER = "/^(skip|skipIf|runIf|todo|fixme)$/";
const SKIPPED_TEST_RESTRICTIONS = [
  { selector: `MemberExpression[object.name=${TEST_API}][property.name=${SKIPPING_MODIFIER}]`, message: SKIPPED_TEST_MESSAGE },
  {
    selector: `MemberExpression[object.property.name=${TEST_API_MODIFIER}][property.name=${SKIPPING_MODIFIER}]`,
    message: SKIPPED_TEST_MESSAGE,
  },
  {
    selector:
      `CallExpression[callee.property.name=/^(skip|fixme)$/]:not([callee.object.name=${TEST_API}])` +
      `:not([callee.object.property.name=${TEST_API_MODIFIER}])`,
    message: SKIPPED_TEST_MESSAGE,
  },
  { selector: "CallExpression[callee.name=/^x(describe|it|test)$/]", message: SKIPPED_TEST_MESSAGE },
  { selector: `CallExpression[callee.object.name=${TEST_API}][callee.property.name='only']`, message: FOCUSED_TEST_MESSAGE },
  {
    selector: `CallExpression[callee.object.property.name=${TEST_API_MODIFIER}][callee.property.name='only']`,
    message: FOCUSED_TEST_MESSAGE,
  },
];

const TOAST_MESSAGE =
  "The app's providers (src/app/providers.tsx) mount only the sonner Toaster, so toasts from any other toast store are never shown. " +
  "Import { toast } from 'sonner' instead.";
const TOAST_RESTRICTIONS = {
  paths: [{ name: "@radix-ui/react-toast", message: TOAST_MESSAGE }],
  patterns: [{ group: ["**/use-toast", "**/ui/toast", "**/ui/toaster"], message: TOAST_MESSAGE }],
};
const NAVIGATION_RESTRICTIONS = [
  {
    name: "next/link",
    message:
      "Import { Link } from '@/components/navigation/Link': it asks a page with unsaved work before leaving it, " +
      "and reports the navigation to page visits (src/lib/navigation).",
  },
  {
    name: "next/navigation",
    importNames: ["useRouter"],
    message:
      "Use useAppRouter from '@/lib/navigation/useAppRouter': it asks a page with unsaved work before leaving it, " +
      "and reports the navigation to page visits (src/lib/navigation).",
  },
];
const NAVIGATION_MODULES = [
  "src/components/navigation/Link.tsx",
  "src/lib/navigation/useAppRouter.ts",
  "src/lib/navigation/leavesPage.ts",
  "src/components/RequireAuth.tsx",
];
const NEXT_ROUTE_MODULE_EXPORTS = [
  "metadata",
  "generateMetadata",
  "viewport",
  "generateViewport",
  "generateStaticParams",
  "dynamic",
  "dynamicParams",
  "revalidate",
  "fetchCache",
  "runtime",
  "preferredRegion",
  "maxDuration",
];

const STORAGE_MESSAGE =
  "Reading window.localStorage throws when a browser blocks site data, which crashes the app. " +
  "Use safeLocalStorage or getLocalStorage() from src/lib/browserStorage.ts, the only module allowed to touch it.";

const VOCABULARY_MESSAGE =
  "User-visible text must use docs/PRODUCT_SENSE.md terms: 'Organization' (not Team/Workspace) and 'Personal' " +
  "(not 'Personal workspace'). Legacy code identifiers are fine; this rule only checks visible copy.";
const LEGACY_TERM_CAPITALIZED = "/\\b(Teams?|Workspaces?)\\b/";
const WORKSPACE_IN_PROSE = "/^(?=.*\\s).*\\bworkspaces?\\b/i";
const LIBRARY_MESSAGE =
  "The /templates/ page is the Template Library (docs/PRODUCT_SENSE.md): label it 'Template Library' and " +
  "its buttons 'Browse the Template Library', never Discover, Discover Templates or Browse Templates.";
const LIBRARY_OLD_NAME = "/^\\s*Discover\\s*$|\\bDiscover Templates\\b|\\bBrowse (?:Public )?Templates\\b|\\bBrowse templates\\b/";

export default tseslint.config(
  {
    ignores: [
      "dist",
      "coverage",
      "playwright-report",
      "test-results",
      "tests/test-results",
      ".wrangler",
      "tmp",
      ".next",
      ".open-next",
      "next-env.d.ts",
      "cloudflare-env.d.ts",
    ],
  },
  ...nextVitals,
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx,mts,cts}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none", ignoreRestSiblings: true },
      ],
      "@typescript-eslint/no-non-null-assertion": "error",
      "@next/next/no-img-element": "off",
    },
  },
  {
    extends: [js.configs.recommended],
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: { globals: NODE_MODULE_GLOBALS },
  },
  {
    files: ["**/*.cjs"],
    languageOptions: { sourceType: "commonjs", globals: globals.node },
  },
  {
    files: ["src/**/*.tsx"],
    plugins: { "react-refresh": reactRefresh },
    rules: {
      "react-refresh/only-export-components": ["error", { allowExportNames: NEXT_ROUTE_MODULE_EXPORTS }],
    },
  },
  {
    files: ["**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"],
    linterOptions: { noInlineConfig: true },
    plugins: { serplists: SERPLISTS_RULES },
    rules: { "max-lines": ["error", { max: MAX_LINES }], "serplists/no-comments": "error" },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: NAVIGATION_MODULES,
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: [...TOAST_RESTRICTIONS.paths, ...NAVIGATION_RESTRICTIONS], patterns: TOAST_RESTRICTIONS.patterns },
      ],
    },
  },
  {
    files: NAVIGATION_MODULES,
    rules: {
      "no-restricted-imports": ["error", TOAST_RESTRICTIONS],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/browserStorage.ts"],
    rules: {
      "no-restricted-properties": [
        "error",
        { object: "window", property: "localStorage", message: STORAGE_MESSAGE },
        { object: "window", property: "sessionStorage", message: STORAGE_MESSAGE },
        { object: "globalThis", property: "localStorage", message: STORAGE_MESSAGE },
      ],
      "no-restricted-globals": [
        "error",
        { name: "localStorage", message: STORAGE_MESSAGE },
        { name: "sessionStorage", message: STORAGE_MESSAGE },
      ],
    },
  },
  {
    files: ["functions/**/*.ts"],
    ignores: ["functions/api/utils/logger.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.object.name='console']",
          message:
            "Use log(level, 'snake_case_event', { ...fields }) from functions/api/utils/logger.ts so API logs are " +
            "structured JSON. Log ids (userId, templateId, requestId), never emails, tokens, or other personal data.",
        },
      ],
    },
  },
  {
    files: ["src/views/**/*.tsx", "src/components/**/*.tsx", "src/features/**/*.{ts,tsx}"],
    ignores: ["src/components/ui/**", "**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        { selector: "JSXText[value=/\\b(Teams?|[Ww]orkspaces?)\\b/]", message: VOCABULARY_MESSAGE },
        { selector: `Literal[value=${LEGACY_TERM_CAPITALIZED}]`, message: VOCABULARY_MESSAGE },
        { selector: `Literal[value=${WORKSPACE_IN_PROSE}]`, message: VOCABULARY_MESSAGE },
        { selector: `TemplateElement[value.raw=${LEGACY_TERM_CAPITALIZED}]`, message: VOCABULARY_MESSAGE },
        { selector: `TemplateElement[value.raw=${WORKSPACE_IN_PROSE}]`, message: VOCABULARY_MESSAGE },
        { selector: `JSXText[value=${LIBRARY_OLD_NAME}]`, message: LIBRARY_MESSAGE },
        { selector: `Literal[value=${LIBRARY_OLD_NAME}]`, message: LIBRARY_MESSAGE },
        { selector: `TemplateElement[value.raw=${LIBRARY_OLD_NAME}]`, message: LIBRARY_MESSAGE },
      ],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "serplists/restricted-code": ["error", APP_CONVENTIONS],
      "serplists/navigate-while-visit-is-current": "error",
    },
  },
  {
    files: ["functions/**/*.ts"],
    rules: { "serplists/restricted-code": ["error", API_CONVENTIONS] },
  },
  {
    files: ["scripts/**/*.{js,mjs,cjs,ts,mts}"],
    rules: { "serplists/restricted-code": ["error", SCRIPT_CONVENTIONS] },
  },
  {
    files: [...APP_API_SCRIPT_AND_DATABASE_CODE, ...TEST_FILES],
    rules: { "serplists/no-external-data-casts": "error" },
  },
  {
    files: ["tests/e2e/**/*.{ts,mjs,js}"],
    rules: { "serplists/restricted-code": ["error", BROWSER_TEST_CONVENTIONS] },
  },
  {
    files: ["tests/integration/**/*.{ts,mjs,js}"],
    rules: { "serplists/restricted-code": ["error", INTEGRATION_TEST_CONVENTIONS] },
  },
  {
    files: TEST_FILES,
    rules: {
      "no-restricted-syntax": ["error", ...SKIPPED_TEST_RESTRICTIONS],
      "serplists/no-source-text-reads": "error",
    },
  }
);
