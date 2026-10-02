import baseConfig from "./eslint.config";

export const TYPE_CHECKED_AREAS = [
  { folders: ["src"], files: ["src/**/*.{ts,tsx}"], project: "./tsconfig.json" },
  { folders: ["functions", "db"], files: ["functions/**/*.ts", "db/**/*.ts"], project: "./functions/tsconfig.json" },
  { folders: ["scripts"], files: ["scripts/**/*.{ts,mts}"], project: "./tsconfig.node.json" },
  { folders: ["tests"], files: ["tests/**/*.{ts,tsx,mts,cts}"], project: "./tests/tsconfig.json" },
];

const UNSAFE_ANY_RULES = {
  "@typescript-eslint/no-unsafe-argument": "error",
  "@typescript-eslint/no-unsafe-assignment": "error",
  "@typescript-eslint/no-unsafe-call": "error",
  "@typescript-eslint/no-unsafe-member-access": "error",
  "@typescript-eslint/no-unsafe-return": "error",
};

const typeAwareConfig = [
  ...baseConfig,
  ...TYPE_CHECKED_AREAS.map(({ files, project }) => ({
    files,
    languageOptions: {
      parserOptions: { project, tsconfigRootDir: import.meta.dirname },
    },
    rules: { ...UNSAFE_ANY_RULES, "@typescript-eslint/no-unsafe-type-assertion": "error" },
  })),
];

export default typeAwareConfig;
