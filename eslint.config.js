import js from "@eslint/js";
import nextVitals from "eslint-config-next/core-web-vitals";
import globals from "globals";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

// Rule messages are written as instructions: they are read by coding agents.
// See docs/design-docs/core-beliefs.md for the reasoning behind each rule.

const MAX_LINES = 500;
// Legacy files already over MAX_LINES, capped at roughly their current size.
// Lower a cap when a file shrinks; never raise one. Split the file instead.
const LEGACY_MAX_LINES = {
};

const TOAST_MESSAGE =
  "The app's providers (src/app/providers.tsx) mount only the sonner Toaster, so toasts from any other toast store are never shown. " +
  "Import { toast } from 'sonner' instead.";
const TOAST_RESTRICTIONS = {
  paths: [{ name: "@radix-ui/react-toast", message: TOAST_MESSAGE }],
  patterns: [{ group: ["**/use-toast", "**/ui/toast", "**/ui/toaster"], message: TOAST_MESSAGE }],
};
// A page with unsaved work is asked before any navigation leaves it (useUnsavedChangesGuard),
// which only the app's Link and useAppRouter know to do.
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
// The navigation code itself, and RequireAuth, whose redirect of a signed-out visitor must
// never wait on a page (the session ending already kept the page's work).
const NAVIGATION_MODULES = [
  "src/components/navigation/Link.tsx",
  "src/lib/navigation/useAppRouter.ts",
  "src/lib/navigation/leavesPage.ts",
  "src/components/RequireAuth.tsx",
];
// User content (uploads and linked images from any host, of any size) is shown as it is;
// next/image would need an image loader for every host.
const USER_CONTENT_IMAGES = [
  "src/components/shared/TaskImage.tsx",
  "src/components/template/PublicTemplateContent.tsx",
  "src/components/ui/file-upload.tsx",
];

const STORAGE_MESSAGE =
  "Reading window.localStorage throws when a browser blocks site data, which crashes the app. " +
  "Use safeLocalStorage or getLocalStorage() from src/lib/browserStorage.ts, the only module allowed to touch it.";

const VOCABULARY_MESSAGE =
  "User-visible text must use docs/PRODUCT_SENSE.md terms: 'Organization' (not Team/Workspace) and 'Personal' " +
  "(not 'Personal workspace'). Legacy code identifiers are fine; this rule only checks visible copy.";
// Capitalized "Team"/"Workspace" are product names; lowercase "team" is ordinary English
// ("helps teams ship"), but lowercase "workspace" in prose is the retired product term.
const LEGACY_TERM_CAPITALIZED = "/\\b(Teams?|Workspaces?)\\b/";
const LEGACY_TERM_IN_PROSE = "/^(?=.*\\s).*\\bworkspaces?\\b/i";
// The /templates/ page is the Template Library. Its old names were the sidebar's "Discover",
// the heading "Discover Templates" and "Browse Templates" buttons; prose such as "browse
// public templates" is fine.
const LIBRARY_MESSAGE =
  "The /templates/ page is the Template Library (docs/PRODUCT_SENSE.md): label it 'Template Library' and " +
  "its buttons 'Browse the Template Library', never Discover, Discover Templates or Browse Templates.";
const LIBRARY_OLD_NAME = "/^\\s*Discover\\s*$|\\bDiscover Templates\\b|\\bBrowse (?:Public )?Templates\\b|\\bBrowse templates\\b/";
// A direct clipboard write can reject (Safari after an awaited request, denied permission,
// lost focus) and lose what it was copying, so all copies go through one helper.
const CLIPBOARD_RESTRICTION = {
  selector: "MemberExpression[property.name='clipboard']",
  message:
    "Copy with copyTextToClipboard from src/lib/clipboard.ts: it never throws and returns false when the browser " +
    "refuses. Also show the text (for share links, ShareLinkDialog) so a failed copy never loses it.",
};

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
  // Next.js's own rules (React, React Hooks with the React Compiler checks, accessibility,
  // imports, and @next/next with the Core Web Vitals rules as errors).
  ...nextVitals,
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx,mts,cts}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-refresh": reactRefresh,
    },
    rules: {
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none", ignoreRestSiblings: true },
      ],
    },
  },
  {
    // Disable fast refresh warnings for UI components, contexts, Next.js route files (which
    // export metadata, route segment config, and handlers by convention), and tests.
    files: [
      "**/components/ui/*.{ts,tsx}",
      "**/contexts/*.{ts,tsx}",
      "src/app/**/*.{ts,tsx}",
      "tests/**/*.{ts,tsx}",
      "**/*.test.{ts,tsx}",
    ],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
  {
    files: USER_CONTENT_IMAGES,
    rules: {
      "@next/next/no-img-element": "off",
    },
  },
  {
    files: ["src/**/*.{ts,tsx}", "functions/**/*.ts"],
    ignores: ["src/components/ui/**", "**/*.test.{ts,tsx}"],
    rules: {
      "max-lines": ["error", { max: MAX_LINES }],
    },
  },
  ...Object.entries(LEGACY_MAX_LINES).map(([file, max]) => ({
    files: [file],
    rules: { "max-lines": ["error", { max }] },
  })),
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
        { selector: `Literal[value=${LEGACY_TERM_IN_PROSE}]`, message: VOCABULARY_MESSAGE },
        { selector: `TemplateElement[value.raw=${LEGACY_TERM_CAPITALIZED}]`, message: VOCABULARY_MESSAGE },
        { selector: `TemplateElement[value.raw=${LEGACY_TERM_IN_PROSE}]`, message: VOCABULARY_MESSAGE },
        { selector: `JSXText[value=${LIBRARY_OLD_NAME}]`, message: LIBRARY_MESSAGE },
        { selector: `Literal[value=${LIBRARY_OLD_NAME}]`, message: LIBRARY_MESSAGE },
        { selector: `TemplateElement[value.raw=${LIBRARY_OLD_NAME}]`, message: LIBRARY_MESSAGE },
        CLIPBOARD_RESTRICTION,
      ],
    },
  },
  {
    // The rest of src/ (pages, components, and features get CLIPBOARD_RESTRICTION above).
    files: [
      "src/*.{ts,tsx}",
      "src/components/ui/**/*.{ts,tsx}",
      "src/{contexts,data,hooks,lib,types,utils}/**/*.{ts,tsx}",
    ],
    ignores: ["src/lib/clipboard.ts", "**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": ["error", CLIPBOARD_RESTRICTION],
    },
  },
  {
    // Relax TypeScript rules for test files
    files: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}", "**/tests/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-this-alias": "off",
    },
  }
);
