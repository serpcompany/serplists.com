const SECTION_HEADING = /^## (.+)$/;
const ITEM_HEADING = /^### (.+)$/;
const BLOCK_OPENER = /^(`{3,})serplists:(.*)$/;
const BLOCK_TYPE_PREFIX = "serplists:";
const MIN_FENCE_LENGTH = 3;
const STRUCTURAL_LINE_ESCAPED_OR_NOT = /^\\*(?:#{2,3} |`{3,}serplists:)/;
const ESCAPED_STRUCTURAL_LINE = /^\\+(?:#{2,3} |`{3,}serplists:)/;

export type TemplateMarkdownBlock = { type: string; body: string };
export type TemplateMarkdownItem = {
  title: string;
  description: string;
  blocks: TemplateMarkdownBlock[];
};
export type TemplateMarkdownSection = { title: string; items: TemplateMarkdownItem[] };
export type TemplateMarkdownBody = {
  description: string;
  sections: TemplateMarkdownSection[];
};

const longestLeadingBacktickRun = (value: string): number =>
  value.split("\n").reduce((longest, line) => {
    const run = /^\s*(`*)/.exec(line)?.[1]?.length ?? 0;
    return Math.max(longest, run);
  }, 0);

export const renderTemplateMarkdownBlock = (type: string, value: string): string => {
  const fence = "`".repeat(Math.max(MIN_FENCE_LENGTH, longestLeadingBacktickRun(value) + 1));
  return `${fence}${BLOCK_TYPE_PREFIX}${type}\n${value}\n${fence}`;
};

export const escapeTemplateMarkdownDescription = (description: string): string =>
  description
    .split("\n")
    .map((line) => (STRUCTURAL_LINE_ESCAPED_OR_NOT.test(line) ? `\\${line}` : line))
    .join("\n");

const unescapeDescriptionLine = (line: string): string =>
  ESCAPED_STRUCTURAL_LINE.test(line) ? line.slice(1) : line;

const capturedText = (match: RegExpExecArray, group: number): string => match[group] ?? "";

export const parseTemplateMarkdownBody = (body: string): TemplateMarkdownBody => {
  const lines = body.split("\n")[Symbol.iterator]();
  const descriptionLines: string[] = [];
  const sections: Array<{ title: string; items: Array<TemplateMarkdownItem & { lines: string[] }> }> = [];

  for (let next = lines.next(); !next.done; next = lines.next()) {
    const line = next.value;
    const section = sections.at(-1);
    const opener = BLOCK_OPENER.exec(line);

    if (opener) {
      const type = capturedText(opener, 2).trim();
      const closer = new RegExp(`^\`{${capturedText(opener, 1).length}}\\s*$`);
      const blockLines: string[] = [];
      let closingFence: string | undefined;
      for (let blockLine = lines.next(); !blockLine.done; blockLine = lines.next()) {
        if (closer.test(blockLine.value)) {
          closingFence = blockLine.value;
          break;
        }
        blockLines.push(blockLine.value);
      }
      if (closingFence === undefined) {
        throw new Error(`Content block "${type}" is missing a closing fence`);
      }

      const item = section?.items.at(-1);
      if (item) {
        item.blocks.push({ type, body: blockLines.join("\n").trim() });
      } else if (!section) {
        descriptionLines.push(line, ...blockLines, closingFence);
      }
      continue;
    }

    const sectionHeading = SECTION_HEADING.exec(line);
    const itemHeading = section ? ITEM_HEADING.exec(line) : null;
    if (sectionHeading) {
      sections.push({ title: capturedText(sectionHeading, 1).trim(), items: [] });
    } else if (section && itemHeading) {
      section.items.push({ title: capturedText(itemHeading, 1).trim(), description: "", blocks: [], lines: [] });
    } else if (!section) {
      descriptionLines.push(unescapeDescriptionLine(line));
    } else {
      section.items.at(-1)?.lines.push(unescapeDescriptionLine(line));
    }
  }

  return {
    description: descriptionLines.join("\n").trim(),
    sections: sections.map((section) => ({
      title: section.title,
      items: section.items.map(({ lines: itemLines, ...item }) => ({
        ...item,
        description: itemLines.join("\n").trim(),
      })),
    })),
  };
};
