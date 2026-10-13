import { posix } from "node:path";

const WRAP_WIDTH = 100;
const MAP_BUDGET = 120;
const LEAF_BUDGET = 300;

export const knownLongDocs: Readonly<Record<string, number>> = {
  "docs/agents/billing.md": 364,
  "docs/agents/data-persistence.md": 459,
  "docs/agents/database-operations.md": 416,
  "docs/agents/design.md": 364,
  "docs/agents/frontend.md": 719,
  "docs/agents/organizations.md": 474,
  "docs/agents/run-execution.md": 379,
  "docs/agents/security.md": 510,
  "docs/agents/system-overview.md": 323,
  "docs/agents/template-content-types.md": 323,
  "docs/agents/template-editor.md": 316,
  "docs/agents/testing.md": 601,
  "docs/agents/ui-app-map.md": 371,
  "docs/agents/ui-screen-inventory.md": 2699,
};

export const wrappedLines = (text: string) =>
  text
    .replace(/\r?\n$/, "")
    .split(/\r?\n/)
    .reduce((total, line) => total + Math.max(1, Math.ceil([...line].length / WRAP_WIDTH)), 0);

const isMap = (doc: string) => doc === "README.md" || ["AGENTS.md", "CLAUDE.md"].includes(posix.basename(doc));

const hasABudget = (doc: string) => !/^docs\/(?:api|references|adr)\//.test(doc);

const overBudget = (doc: string, size: number) =>
  isMap(doc)
    ? `is ${size} lines at a ${WRAP_WIDTH}-character wrap, and a map gets ${MAP_BUDGET}: it only routes, so move detail into the doc it routes to`
    : `is ${size} lines at a ${WRAP_WIDTH}-character wrap, and a doc gets ${LEAF_BUDGET}: split it by topic into docs a map links`;

export function budgetProblem(doc: string, text: string, known: Readonly<Record<string, number>> = knownLongDocs): string | undefined {
  if (!hasABudget(doc)) return undefined;
  const size = wrappedLines(text);
  const budget = isMap(doc) ? MAP_BUDGET : LEAF_BUDGET;
  const allowance = known[doc];
  if (allowance === undefined) return size > budget ? overBudget(doc, size) : undefined;
  if (!Number.isInteger(allowance) || allowance <= 0) {
    return "has an entry in knownLongDocs with no size: an allowance holds a doc's size on the day the check arrived and is never added later, so split the doc and remove the entry";
  }
  if (size <= budget) return `now fits its budget of ${budget}: remove it from knownLongDocs`;
  if (size > allowance) return `grew to ${size} lines, over its allowance of ${allowance}: it may shrink but not grow, so split it by topic`;
  if (size < allowance) return `is down to ${size} lines: lower its entry in knownLongDocs to ${size}`;
  return undefined;
}

export const staleAllowances = (isFile: (doc: string) => boolean, known: Readonly<Record<string, number>> = knownLongDocs) =>
  Object.keys(known).filter((doc) => !isFile(doc));
