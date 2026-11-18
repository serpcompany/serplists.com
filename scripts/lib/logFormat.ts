import type { LogEntry } from "./logEntries";

const clockTime = (timestamp: string | undefined) => {
  const match = /T(\d\d:\d\d:\d\d(?:\.\d+)?)/.exec(timestamp ?? "");
  return (match?.[1] ?? "--:--:--").padEnd(12);
};

const fieldValue = (value: unknown) => {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return /[\s"]/.test(text) ? JSON.stringify(text) : text;
};

export function formatEntry(entry: LogEntry): string {
  const fields = Object.entries(entry.fields).map(([name, value]) => `${name}=${fieldValue(value)}`);
  const request = entry.requestId ? [`requestId=${entry.requestId}`] : [];
  return [clockTime(entry.timestamp), entry.level.padEnd(5), entry.event, ...request, ...fields].join(" ");
}

export function formatTable<const Header extends string>(
  headers: readonly Header[],
  rows: ReadonlyArray<Readonly<Record<Header, string | number>>>,
): string {
  const columns = headers.map((header) => ({ header, width: Math.max(header.length, ...rows.map((row) => String(row[header]).length)) }));
  const line = (cellOf: (header: Header) => string) =>
    columns
      .map(({ header, width }, column) => (column === columns.length - 1 ? cellOf(header) : cellOf(header).padEnd(width)))
      .join("  ")
      .trimEnd();
  return [line((header) => header), ...rows.map((row) => line((header) => String(row[header])))].join("\n");
}

export const milliseconds = (value: number) => (value >= 1000 ? `${(value / 1000).toFixed(2)}s` : `${Math.round(value)}ms`);
