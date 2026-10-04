const DAY_SECONDS = 24 * 60 * 60;

export type MarkdownTable = { header: string[]; rows: string[][] };

const cellsOf = (line: string): string[] => line.split("|").slice(1, -1).map((cell) => cell.trim());

export function markdownTables(text: string): MarkdownTable[] {
  const tables: MarkdownTable[] = [];
  let current: MarkdownTable | null = null;
  for (const line of text.split("\n")) {
    if (!line.startsWith("|")) {
      current = null;
      continue;
    }
    if (/^\|\s*-/.test(line)) continue;
    if (current === null) {
      current = { header: cellsOf(line), rows: [] };
      tables.push(current);
    } else {
      current.rows.push(cellsOf(line));
    }
  }
  return tables;
}

const backtickedIn = (cell: string): string[] => [...cell.matchAll(/`([^`]+)`/g)].flatMap((match) => (match[1] ? [match[1]] : []));

export type StaleScore = { name: string; graded: string; changed: { ref: string; time: number }[] };

export function staleScoreRows(
  scoreText: string,
  lastCommitTime: (ref: string) => number | null,
  exists: (ref: string) => boolean,
): StaleScore[] {
  return markdownTables(scoreText).flatMap(({ header, rows }) => {
    const code = header.indexOf("Code");
    const graded = header.indexOf("Graded");
    if (code === -1 || graded === -1) return [];
    return rows.flatMap((row) => {
      const gradedOn = row[graded] ?? "";
      const gradedEnd = Date.parse(`${gradedOn}T00:00:00Z`) / 1000 + DAY_SECONDS;
      if (Number.isNaN(gradedEnd)) return [];
      const changed = backtickedIn(row[code] ?? "")
        .filter(exists)
        .map((ref) => ({ ref, time: lastCommitTime(ref) ?? 0 }))
        .filter(({ time }) => time >= gradedEnd);
      return changed.length === 0 ? [] : [{ name: row[0] ?? "", graded: gradedOn, changed }];
    });
  });
}

const SIZES = ["small", "medium", "large"] as const;
type Size = (typeof SIZES)[number];

export type DebtSummary = { open: number; bySize: Record<Size, number>; unsized: string[]; oldestSmall: string | null };

const isSize = (value: string): value is Size => SIZES.some((size) => size === value);

export function summarizeDebt(trackerText: string): DebtSummary {
  const rows = markdownTables(trackerText).flatMap(({ header, rows: tableRows }) => {
    if (header[0] !== "ID") return [];
    const size = header.indexOf("Size");
    return tableRows.map((row) => ({ id: row[0] ?? "", size: size === -1 ? "" : row[size] ?? "" }));
  });
  const bySize: Record<Size, number> = { small: 0, medium: 0, large: 0 };
  for (const row of rows) if (isSize(row.size)) bySize[row.size] += 1;
  const idNumber = (id: string) => Number(id.replace(/\D/g, ""));
  const oldestSmall = rows.filter((row) => row.size === "small").sort((a, b) => idNumber(a.id) - idNumber(b.id))[0];
  return {
    open: rows.length,
    bySize,
    unsized: rows.filter((row) => !isSize(row.size)).map((row) => row.id),
    oldestSmall: oldestSmall?.id ?? null,
  };
}
