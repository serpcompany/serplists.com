import { type Line, normalizeSpace } from "./markdown";
import { hasTitle, isTestFile, type TestTitle } from "./test-titles";

interface Paragraph {
  line: number;
  text: string;
}

export interface CheckLine {
  line: number;
  abbreviation: string;
  titles: string[] | undefined;
}

const ENDS_A_PARAGRAPH = /^\s*(?:$|[-*+]\s|#{1,6}\s|[|>]|\d+[.)]\s)/;
const SEPARATOR = /^(?:,? and |, )/;
const ABBREVIATION = /\*\*([^*]+)\*\*\s+is\s+`([^`]+)`/g;

function paragraphsStarting(prose: readonly Line[], start: RegExp): Paragraph[] {
  const found: Paragraph[] = [];
  prose.forEach(({ line, text }, index) => {
    if (!start.test(text)) return;
    const continuation: string[] = [];
    for (const next of prose.slice(index + 1)) {
      if (ENDS_A_PARAGRAPH.test(next.text)) break;
      continuation.push(next.text);
    }
    found.push({ line, text: normalizeSpace([text, ...continuation].join(" ")) });
  });
  return found;
}

function abbreviations(prose: readonly Line[]): Map<string, { file: string; line: number }> {
  const named = new Map<string, { file: string; line: number }>();
  for (const { line, text } of paragraphsStarting(prose, /^Abbreviations:/)) {
    for (const match of text.matchAll(ABBREVIATION)) {
      if (match[1] && match[2]) named.set(normalizeSpace(match[1]), { file: match[2], line });
    }
  }
  return named;
}

function closingQuote(text: string): number {
  for (let index = 1; index < text.length; index += 1) {
    if (text[index] !== '"') continue;
    const after = text.slice(index + 1);
    const anotherTitleFollows = SEPARATOR.test(after) && after.replace(SEPARATOR, "").startsWith('"');
    if (after === "" || after === "." || anotherTitleFollows) return index;
  }
  return -1;
}

export function quotedTitles(text: string): string[] | undefined {
  const titles: string[] = [];
  let rest = text.trim();
  while (rest.startsWith('"')) {
    const close = closingQuote(rest);
    if (close === -1) return undefined;
    titles.push(rest.slice(1, close));
    rest = rest.slice(close + 1);
    if (rest === "" || rest === ".") return titles;
    rest = rest.replace(SEPARATOR, "");
  }
  return undefined;
}

export function checkLines(prose: readonly Line[]): CheckLine[] {
  return paragraphsStarting(prose, /^\s*- Check:/).map(({ line, text }) => {
    const statement = text.replace(/^- Check:\s*/, "");
    const comma = statement.indexOf(', "');
    if (comma === -1) return { line, abbreviation: statement, titles: undefined };
    return { line, abbreviation: statement.slice(0, comma).trim(), titles: quotedTitles(statement.slice(comma + 2)) };
  });
}

export interface ProductCheckContext {
  isRepositoryFile: (file: string) => boolean;
  titlesOf: (file: string) => readonly TestTitle[];
}

export function productCheckProblems(prose: readonly Line[], { isRepositoryFile, titlesOf }: ProductCheckContext) {
  const named = abbreviations(prose);
  const problems: { line: number; problem: string }[] = [];
  for (const [abbreviation, { file, line }] of named) {
    if (!isTestFile(file) || !isRepositoryFile(file)) {
      problems.push({ line, problem: `names ${file} as ${abbreviation}, which isn't a test file in the repository: name the test file its checks come from` });
    }
  }
  for (const { line, abbreviation, titles } of checkLines(prose)) {
    const source = named.get(abbreviation);
    if (titles === undefined || titles.length === 0) {
      problems.push({ line, problem: 'is a check line without a quoted test title: write - Check: <Abbreviation>, "<test title>"' });
    } else if (source === undefined) {
      problems.push({ line, problem: `names ${abbreviation}, which the doc's Abbreviations line doesn't define: add **${abbreviation}** is \`<test file>\` to it` });
    } else if (isTestFile(source.file) && isRepositoryFile(source.file)) {
      for (const title of titles.filter((quoted) => !hasTitle(titlesOf(source.file), quoted))) {
        problems.push({ line, problem: `names "${title}" in ${source.file}, and no test there has that title: give the doc the test's new title, or restore the test` });
      }
    }
  }
  return problems;
}
