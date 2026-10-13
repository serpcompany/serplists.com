import { posix } from "node:path";
import { lineLimit } from "../checks/sizes";

const DAY_SECONDS = 24 * 60 * 60;
export const NEAR_LIMIT_LINES = lineLimit - 50;
export const QUALITY_FILE = "docs/quality.md";
export const DEBT_FILES = ["docs/tech-debt.md", "docs/harness-debt.md"];

type MarkdownTable = { heading: string; header: string[]; rows: string[][] };

const cellsOf = (line: string): string[] => line.split("|").slice(1, -1).map((cell) => cell.trim());

export function markdownTables(text: string): MarkdownTable[] {
  const tables: MarkdownTable[] = [];
  let heading = "";
  let current: MarkdownTable | null = null;
  for (const line of text.split("\n")) {
    const title = /^#+\s+(.*)$/.exec(line)?.[1];
    if (title !== undefined) heading = title.trim();
    if (!line.startsWith("|")) {
      current = null;
      continue;
    }
    if (/^\|\s*:?-/.test(line)) continue;
    if (current === null) {
      current = { heading, header: cellsOf(line), rows: [] };
      tables.push(current);
    } else {
      current.rows.push(cellsOf(line));
    }
  }
  return tables;
}

export function lastChangeTimes(log: string): Map<string, number> {
  const times = new Map<string, number>();
  for (const record of log.split("\0")) {
    const [time, ...paths] = record.split("\n").filter(Boolean);
    const seconds = Number(time);
    if (!Number.isFinite(seconds)) continue;
    for (const path of paths) if (!times.has(path)) times.set(path, seconds);
  }
  return times;
}

export function lastChange(times: ReadonlyMap<string, number>, path: string): number | undefined {
  const exact = times.get(path);
  if (exact !== undefined) return exact;
  const folder = `${path.replace(/\/$/, "")}/`;
  let newest: number | undefined;
  for (const [file, time] of times) {
    if (file.startsWith(folder) && (newest === undefined || time > newest)) newest = time;
  }
  return newest;
}

const dayOf = (seconds: number) => new Date(seconds * 1000).toISOString().slice(0, 10);
const codeSpans = (text: string): string[] => [...text.matchAll(/`([^`\n]+)`/g)].flatMap((match) => (match[1] ? [match[1]] : []));

type ScoreToRegrade = { area: string; graded: string; changed: { path: string; day: string }[] };
export type QualityRows = { stale: ScoreToRegrade[]; ungraded: string[] };

export function scoresToRegrade(text: string, times: ReadonlyMap<string, number>): QualityRows {
  const stale: ScoreToRegrade[] = [];
  const ungraded: string[] = [];
  for (const { header, rows } of markdownTables(text)) {
    const code = header.indexOf("Code");
    const graded = header.indexOf("Graded");
    if (code === -1 || graded === -1) continue;
    for (const row of rows) {
      const area = row[0] ?? "";
      const gradedOn = row[graded] ?? "";
      const gradedDayEnd = Date.parse(`${gradedOn}T00:00:00Z`) / 1000 + DAY_SECONDS;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(gradedOn) || Number.isNaN(gradedDayEnd)) {
        ungraded.push(area);
        continue;
      }
      const changed = codeSpans(row[code] ?? "").flatMap((path) => {
        const time = lastChange(times, path);
        return time !== undefined && time >= gradedDayEnd ? [{ path, day: dayOf(time) }] : [];
      });
      if (changed.length > 0) stale.push({ area, graded: gradedOn, changed });
    }
  }
  return { stale, ungraded };
}

const SIZES = ["small", "medium", "large"] as const;
type Size = (typeof SIZES)[number];
const isSize = (value: string): value is Size => SIZES.some((size) => size === value);

export type DebtItem = { section: string; debt: string; issue: string };
export type DebtSummary = { open: number; bySize: Record<Size, number>; firstSmall: DebtItem | null; unsized: DebtItem[] };

export function firstSentence(text: string): string {
  let insideCode = false;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "`") insideCode = !insideCode;
    const ends = text[index] === "." && (index === text.length - 1 || text[index + 1] === " ");
    if (ends && !insideCode) return text.slice(0, index + 1);
  }
  return text;
}

export function summarizeDebt(text: string): DebtSummary {
  const rows = markdownTables(text).flatMap(({ heading, header, rows: tableRows }) => {
    if (header[0] !== "Debt") return [];
    const size = header.indexOf("Size");
    const issue = header.indexOf("Issue");
    return tableRows.map((row) => ({
      size: size === -1 ? "" : (row[size] ?? ""),
      item: { section: heading, debt: firstSentence(row[0] ?? ""), issue: issue === -1 ? "" : (row[issue] ?? "") },
    }));
  });
  const bySize: Record<Size, number> = { small: 0, medium: 0, large: 0 };
  for (const row of rows) if (isSize(row.size)) bySize[row.size] += 1;
  return {
    open: rows.length,
    bySize,
    firstSmall: rows.find((row) => row.size === "small")?.item ?? null,
    unsized: rows.filter((row) => !isSize(row.size)).map((row) => row.item),
  };
}

const FOLDERS_GARDENING_LEAVES_ALONE = ["docs/adr/", "docs/api/", "docs/references/"];

export const isGardenedDoc = (path: string): boolean =>
  path.endsWith(".md") && !FOLDERS_GARDENING_LEAVES_ALONE.some((folder) => path.startsWith(folder));

function withoutFencedCode(text: string): string {
  let fenced = false;
  return text
    .split("\n")
    .filter((line) => {
      if (/^\s*(?:```|~~~)/.test(line)) {
        fenced = !fenced;
        return false;
      }
      return !fenced;
    })
    .join("\n");
}

const linkTargets = (text: string): string[] =>
  [...text.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)].flatMap((match) => (match[1] ? [match[1]] : []));

const isExternal = (target: string) => /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("#");

export function namedFiles(doc: string, text: string, isFile: (path: string) => boolean): string[] {
  const prose = withoutFencedCode(text);
  const folder = posix.dirname(doc);
  const linked = linkTargets(prose)
    .filter((target) => !isExternal(target))
    .map((target) => {
      const path = target.replace(/[#?].*$/, "");
      return path.startsWith("/") ? path.slice(1) : posix.normalize(posix.join(folder, path));
    });
  const named = codeSpans(prose).map((span) => {
    const path = span.trim().replace(/^\.\//, "").replace(/(?::\d+(?:-\d+)?|#.*)$/, "");
    return isFile(path) ? path : posix.normalize(posix.join(folder, path));
  });
  return [...new Set([...linked, ...named])].filter((path) => !path.endsWith(".md") && isFile(path)).sort();
}

export type StaleDoc = { doc: string; changed: string[] };

export function docsToReverify(
  docs: readonly { doc: string; references: readonly string[] }[],
  times: ReadonlyMap<string, number>,
): StaleDoc[] {
  return docs
    .flatMap(({ doc, references }) => {
      const docTime = times.get(doc);
      if (docTime === undefined) return [];
      const changed = references.filter((reference) => (times.get(reference) ?? 0) > docTime);
      return changed.length > 0 ? [{ doc, changed }] : [];
    })
    .sort((a, b) => b.changed.length - a.changed.length || a.doc.localeCompare(b.doc));
}

export type UncheckedBehaviors = { doc: string; lines: number[] };

export function uncheckedBehaviors(docs: readonly { doc: string; text: string }[]): UncheckedBehaviors[] {
  return docs.flatMap(({ doc, text }) => {
    const lines = text.split("\n").flatMap((line, index) => (/^\s*[-*]\s+No automated check yet\b/.test(line) ? [index + 1] : []));
    return lines.length > 0 ? [{ doc, lines }] : [];
  });
}

export type SizedFile = { path: string; lines: number };

export const filesNearLimit = (files: readonly SizedFile[], allowedOverLimit: ReadonlySet<string>): SizedFile[] =>
  files
    .filter(({ path, lines }) => lines >= NEAR_LIMIT_LINES && lines <= lineLimit && !allowedOverLimit.has(path))
    .sort((a, b) => b.lines - a.lines || a.path.localeCompare(b.path));
