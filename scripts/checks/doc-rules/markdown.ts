export interface Line {
  line: number;
  text: string;
}

export interface Reference {
  line: number;
  target: string;
}

const FENCE = /^\s*(`{3,}|~{3,})(.*)$/;

function fenceMask(lines: readonly string[]): boolean[] {
  let opening: string | undefined;
  return lines.map((line) => {
    const marker = FENCE.exec(line)?.[1];
    if (opening === undefined) {
      opening = marker;
      return marker !== undefined;
    }
    const closes = marker !== undefined && marker[0] === opening[0] && marker.length >= opening.length && line.trim() === marker;
    if (closes) opening = undefined;
    return true;
  });
}

function splitLines(text: string): string[] {
  return text.split(/\r?\n/);
}

export function proseLines(text: string): Line[] {
  const lines = splitLines(text);
  const fenced = fenceMask(lines);
  return lines.map((line, index) => ({ line: index + 1, text: fenced[index] ? "" : line }));
}

export function fencedCodeLines(text: string): Line[] {
  const lines = splitLines(text);
  const fenced = fenceMask(lines);
  return lines.flatMap((line, index) => (fenced[index] && !FENCE.test(line) ? [{ line: index + 1, text: line }] : []));
}

export const codeSpans = (line: string) => [...line.matchAll(/`([^`]+)`/g)].flatMap((match) => (match[1] ? [match[1]] : []));

export const withoutCodeSpans = (line: string) => line.replace(/`[^`]*`/g, (span) => " ".repeat(span.length));

function destination(inside: string): string | undefined {
  const trimmed = inside.trim();
  if (trimmed.startsWith("<")) return /^<([^>]*)>/.exec(trimmed)?.[1];
  return /^\S+/.exec(trimmed)?.[0];
}

function inlineLinks(line: string): string[] {
  const targets: string[] = [];
  for (let start = line.indexOf("]("); start !== -1; start = line.indexOf("](", start + 2)) {
    let depth = 0;
    let end = start + 2;
    for (; end < line.length; end += 1) {
      const character = line[end];
      if (character === "(") depth += 1;
      else if (character === ")") {
        if (depth === 0) break;
        depth -= 1;
      }
    }
    if (end >= line.length) break;
    const target = destination(line.slice(start + 2, end));
    if (target) targets.push(target);
  }
  return targets;
}

const REFERENCE_DEFINITION = /^\s*\[[^\]]+\]:\s*<?([^\s>]+)>?/;

export function markdownLinks(prose: readonly Line[]): Reference[] {
  return prose.flatMap(({ line, text }) => {
    const outsideCode = withoutCodeSpans(text);
    const definition = REFERENCE_DEFINITION.exec(outsideCode)?.[1];
    const targets = definition ? [definition] : inlineLinks(outsideCode);
    return targets.map((target) => ({ line, target }));
  });
}

export const normalizeSpace = (text: string) => text.replace(/\s+/g, " ").trim();
