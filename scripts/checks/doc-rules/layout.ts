const ROOT_DOCS = new Set(["AGENTS.md", "ARCHITECTURE.md", "CONTEXT.md", "README.md", "CLAUDE.md"]);
const DOCS_ENTRIES = new Set([
  "adr",
  "agents",
  "api",
  "product",
  "references",
  "quality.md",
  "tech-debt.md",
  "harness-debt.md",
]);
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DECISION_RECORD = /^\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;

export const layoutAdvice =
  "isn't where docs go: the root holds only the maps, ARCHITECTURE.md and CONTEXT.md; how an area works goes in " +
  "docs/agents/<area>.md, a decision in docs/adr/, a reference a tool writes in docs/api/, what the product does in " +
  "docs/product/, a vendored third-party doc in docs/references/, and the grades and debt in docs/quality.md, " +
  "docs/tech-debt.md and docs/harness-debt.md. A new top-level doc goes in scripts/checks/doc-rules/layout.ts first";

const MAPS = new Set(["README.md", "AGENTS.md", "CLAUDE.md"]);

export const namingAdvice =
  "isn't named in kebab-case: under docs/, name files and folders in lowercase words joined by hyphens (only the maps, " +
  "README.md, AGENTS.md and CLAUDE.md, keep capitals; docs/api/ and docs/references/ keep the names their sources give)";

export const decisionNamingAdvice =
  "isn't named like a decision record: name it NNNN-<what-was-decided>.md, numbered after the last one in docs/adr/";

export function outOfLayout(path: string): boolean {
  if (!path.includes("/")) return path.endsWith(".md") && !ROOT_DOCS.has(path);
  if (!path.startsWith("docs/")) return false;
  return !DOCS_ENTRIES.has(path.slice("docs/".length).split("/")[0] ?? "");
}

export function misnamed(path: string): boolean {
  if (!path.startsWith("docs/") || /^docs\/(?:api|references)\//.test(path)) return false;
  const parts = path.slice("docs/".length).split("/");
  const file = parts.pop() ?? "";
  if (parts.some((folder) => !KEBAB.test(folder))) return true;
  return !MAPS.has(file) && !KEBAB.test(file.replace(/\.[^.]+$/, ""));
}

export function misnamedDecision(path: string): boolean {
  const name = /^docs\/adr\/([^/]+)$/.exec(path)?.[1];
  return name !== undefined && name !== "README.md" && !DECISION_RECORD.test(name);
}
