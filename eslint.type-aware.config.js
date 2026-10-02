import baseConfig from "./eslint.config.js";

const TYPE_CHECKED_CODE = ["src/**/*.{ts,tsx}", "functions/**/*.ts", "scripts/**/*.{ts,mts}", "db/**/*.ts"];
const TYPE_CHECKED_TESTS = ["tests/**/*.{ts,tsx,mts,cts}"];
const TYPE_CHECKED_PROJECTS = ["./tsconfig.json", "./functions/tsconfig.json", "./tsconfig.node.json", "./tests/tsconfig.json"];

const UNSAFE_ANY_RULES = {
  "@typescript-eslint/no-unsafe-argument": "error",
  "@typescript-eslint/no-unsafe-assignment": "error",
  "@typescript-eslint/no-unsafe-call": "error",
  "@typescript-eslint/no-unsafe-member-access": "error",
  "@typescript-eslint/no-unsafe-return": "error",
};

const typeAwareConfig = [
  ...baseConfig,
  {
    files: [...TYPE_CHECKED_CODE, ...TYPE_CHECKED_TESTS],
    languageOptions: {
      parserOptions: { project: TYPE_CHECKED_PROJECTS, tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    files: TYPE_CHECKED_CODE,
    rules: { ...UNSAFE_ANY_RULES, "@typescript-eslint/no-unsafe-type-assertion": "error" },
  },
  {
    files: TYPE_CHECKED_TESTS,
    rules: UNSAFE_ANY_RULES,
  },
];

export default typeAwareConfig;
