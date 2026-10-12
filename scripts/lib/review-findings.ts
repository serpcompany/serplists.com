import { z } from "zod";

const findingSchema = z.object({ path: z.string(), body: z.string(), url: z.string(), pull: z.number().int() });

type ReviewFinding = z.infer<typeof findingSchema>;

export type FindingGroup = {
  part: string;
  findings: number;
  pulls: number;
  blocking: number;
  examples: { title: string; url: string }[];
};

export const REPEATED = { findings: 3, pulls: 2 };
const EXAMPLES_SHOWN = 3;
const TITLE_LENGTH = 100;
const FOLDERS_SPLIT_BY_SUBFOLDER = new Set(["src", "functions", "tests", "docs", "db", ".github", ".claude"]);

export function partOf(path: string): string {
  const [first = "", second] = path.split("/");
  if (second === undefined || !FOLDERS_SPLIT_BY_SUBFOLDER.has(first)) return first;
  return `${first}/${second.replace(/\.[a-z]+$/, "")}`;
}

export function titleOf(body: string): string {
  const line = (body.split("\n").find((text) => text.trim()) ?? "")
    .replace(/\*\*/g, "")
    .replace(/[[\]]/g, "")
    .replace(/^(?:blocking|suggestion)\b[\s:.,-]*/i, "")
    .trim();
  return line.length > TITLE_LENGTH ? `${line.slice(0, TITLE_LENGTH - 1)}…` : line;
}

const isBlocking = (body: string) => /^\W*blocking\b/i.test(body);

export function readFindings(json: unknown): ReviewFinding[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((item: unknown) => {
    const finding = findingSchema.safeParse(item);
    return finding.success ? [finding.data] : [];
  });
}

export function groupFindings(findings: readonly ReviewFinding[]): FindingGroup[] {
  const parts = new Map<string, ReviewFinding[]>();
  for (const finding of findings) {
    const part = partOf(finding.path);
    parts.set(part, [...(parts.get(part) ?? []), finding]);
  }
  return [...parts]
    .map(([part, found]) => ({
      part,
      findings: found.length,
      pulls: new Set(found.map((finding) => finding.pull)).size,
      blocking: found.filter((finding) => isBlocking(finding.body)).length,
      examples: found.slice(0, EXAMPLES_SHOWN).map((finding) => ({ title: titleOf(finding.body), url: finding.url })),
    }))
    .sort((a, b) => b.pulls - a.pulls || b.findings - a.findings || a.part.localeCompare(b.part));
}

export const isRepeated = (group: FindingGroup): boolean =>
  group.findings >= REPEATED.findings && group.pulls >= REPEATED.pulls;
