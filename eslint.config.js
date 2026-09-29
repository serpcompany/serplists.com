import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

// Rule messages are written as instructions: they are read by coding agents.
// See docs/design-docs/core-beliefs.md for the reasoning behind each rule.

const MAX_LINES = 500;
// Legacy files already over MAX_LINES, capped at roughly their current size.
// Lower a cap when a file shrinks; never raise one. Split the file instead.
const LEGACY_MAX_LINES = {
  "functions/api/handlers/templates.ts": 1650,
  "functions/api/handlers/checklists.ts": 1200,
  "functions/api/handlers/teams.ts": 1100,
  "src/views/TemplateDetail.tsx": 900,
  "functions/api/handlers/agentMcp.ts": 900,
  "src/lib/templates/templateMarkdown.ts": 750,
  "src/components/account/TeamSettingsSection.tsx": 600,
  "src/views/ChecklistRun.tsx": 700,
  "src/features/run-execution/useRunExecutionModel.ts": 650,
  "src/lib/api.ts": 650,
  "src/components/template-editor/SectionSidebar.tsx": 650,
  "src/components/TemplateBackup.tsx": 530,
};

const TOAST_MESSAGE =
  "The app's providers (src/app/providers.tsx) mount only the sonner Toaster, so toasts from any other toast store are never shown. " +
  "Import { toast } from 'sonner' instead.";

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
    ignores: ["dist", "coverage", "playwright-report", "test-results", ".wrangler", "tmp", ".next", ".open-next", "next-env.d.ts", "cloudflare-env.d.ts"],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
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
    // Disable fast refresh warnings for UI components, contexts, and Next.js route files (which
    // export metadata, route segment config, and handlers by convention).
    files: ["**/components/ui/*.{ts,tsx}", "**/contexts/*.{ts,tsx}", "src/app/**/*.{ts,tsx}"],
    rules: {
      "react-refresh/only-export-components": "off",
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
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [{ name: "@radix-ui/react-toast", message: TOAST_MESSAGE }],
          patterns: [{ group: ["**/use-toast", "**/ui/toast", "**/ui/toaster"], message: TOAST_MESSAGE }],
        },
      ],
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
