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

export function formatTable(headers: string[], rows: Array<Array<string | number>>): string {
  const lines = [headers, ...rows];
  const widths = headers.map((_, column) => Math.max(...lines.map((row) => String(row[column]).length)));
  return lines
    .map((row) =>
      widths
        .map((width, column) => (column === widths.length - 1 ? String(row[column]) : String(row[column]).padEnd(width)))
        .join("  ")
        .trimEnd(),
    )
    .join("\n");
}

export const milliseconds = (value: number) => (value >= 1000 ? `${(value / 1000).toFixed(2)}s` : `${Math.round(value)}ms`);
