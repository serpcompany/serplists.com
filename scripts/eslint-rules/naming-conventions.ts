type NameMatch = { regex: string; match: boolean };
type Affix = "allow" | "forbid";

export type NamingConvention = {
  selector: string | string[];
  modifiers?: string[];
  format: string[] | null;
  custom?: NameMatch;
  filter?: NameMatch;
  leadingUnderscore?: Affix;
  trailingUnderscore?: Affix;
};

const CAMEL_OR_PASCAL_CASE = ["camelCase", "PascalCase"];
const NO_UNDERSCORE_AFFIXES = { leadingUnderscore: "forbid", trailingUnderscore: "forbid" } satisfies Partial<NamingConvention>;
const NOT_ALL_CAPITALS: NameMatch = { regex: "^[A-Z][A-Z0-9]+$", match: false };

const NEXT_ROUTE_HANDLER_NAMES = ["GET", "HEAD", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"];

const VALUES_IN_CAMEL_OR_PASCAL_CASE: NamingConvention[] = [
  { selector: ["variable", "function", "import"], format: CAMEL_OR_PASCAL_CASE, custom: NOT_ALL_CAPITALS, ...NO_UNDERSCORE_AFFIXES },
  {
    selector: "parameter",
    format: CAMEL_OR_PASCAL_CASE,
    custom: NOT_ALL_CAPITALS,
    leadingUnderscore: "allow",
    trailingUnderscore: "forbid",
  },
];

const UPPER_CASE_FOR_MODULE_CONSTANTS: NamingConvention = {
  selector: "variable",
  modifiers: ["const", "global"],
  format: [...CAMEL_OR_PASCAL_CASE, "UPPER_CASE"],
  ...NO_UNDERSCORE_AFFIXES,
};

const NAMES_ANOTHER_MODULE_GIVES: NamingConvention[] = [
  {
    selector: "function",
    modifiers: ["exported", "global"],
    filter: { regex: `^(${NEXT_ROUTE_HANDLER_NAMES.join("|")})$`, match: true },
    format: ["UPPER_CASE"],
  },
];

const NAMES_THAT_MIRROR_EXTERNAL_DATA: NamingConvention[] = [
  { selector: ["objectLiteralProperty", "objectLiteralMethod", "typeProperty", "typeMethod", "enumMember"], format: null },
  { selector: ["variable", "parameter"], modifiers: ["destructured"], format: null },
  { selector: "variable", modifiers: ["destructured", "const", "global"], format: null },
];

export const NAMING_CONVENTIONS: NamingConvention[] = [
  { selector: "default", format: ["camelCase"], ...NO_UNDERSCORE_AFFIXES },
  ...VALUES_IN_CAMEL_OR_PASCAL_CASE,
  UPPER_CASE_FOR_MODULE_CONSTANTS,
  { selector: "typeLike", format: ["PascalCase"], ...NO_UNDERSCORE_AFFIXES },
  ...NAMES_ANOTHER_MODULE_GIVES,
  ...NAMES_THAT_MIRROR_EXTERNAL_DATA,
];
