import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist", "coverage", "playwright-report", "test-results", ".wrangler", "tmp"],
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
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    // Disable fast refresh warnings for UI components and contexts
    files: ["**/components/ui/*.{ts,tsx}", "**/contexts/*.{ts,tsx}"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
  {
    files: ["functions/**/*.{ts,tsx}"],
    ignores: ["functions/api/db.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [{ name: "drizzle-orm/d1", message: "Use the shared createDb module." }],
      }],
      "no-restricted-syntax": [
        "error",
        { selector: "CallExpression[callee.property.name='prepare']", message: "Application data access must use Drizzle's typed query builder." },
        { selector: "CallExpression[callee.property.name='exec']", message: "Application data access must not execute unrestricted SQL." },
        { selector: "MemberExpression[object.name='env'][property.name='DB']", message: "Business modules receive a Drizzle client, not the raw D1 binding." },
        { selector: "CallExpression[callee.object.name='sql'][callee.property.name='raw']", message: "sql.raw() is prohibited." },
      ],
    },
  },
  {
    files: ["scripts/reset-official-serp-password*.mjs", "scripts/set-official-serp-plan*.mjs"],
    rules: {
      "no-restricted-syntax": [
        "error",
        { selector: "CallExpression[callee.property.name='prepare']", message: "Operational business-data tools must use the typed Drizzle module." },
        { selector: "CallExpression[callee.property.name='exec']", message: "Operational business-data tools must not execute unrestricted SQL." },
        { selector: "CallExpression[callee.object.name='sql'][callee.property.name='raw']", message: "sql.raw() is prohibited." },
      ],
    },
  },
  {
    files: ["db/seeds/**/*.{ts,tsx}", "tests/fast-database/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        { selector: "CallExpression[callee.property.name='prepare']", message: "Seeds and ordinary database fixtures must use Drizzle." },
        { selector: "CallExpression[callee.object.name='sql'][callee.property.name='raw']", message: "sql.raw() is prohibited." },
      ],
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
