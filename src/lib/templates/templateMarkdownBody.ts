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
    const run = /^\s*(`*)/.exec(line)?.[1].length ?? 0;
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

export const parseTemplateMarkdownBody = (body: string): TemplateMarkdownBody => {
  const lines = body.split("\n");
  const descriptionLines: string[] = [];
  const sections: Array<{ title: string; items: Array<TemplateMarkdownItem & { lines: string[] }> }> = [];
  let cursor = 0;

  const currentSection = () => sections[sections.length - 1];
  const currentItem = () => currentSection()?.items[currentSection().items.length - 1];
  const inTemplateDescription = () => sections.length === 0;

  while (cursor < lines.length) {
    const line = lines[cursor];
    const opener = BLOCK_OPENER.exec(line);

    if (opener) {
      const type = opener[2].trim();
      const closer = new RegExp(`^\`{${opener[1].length}}\\s*$`);
      const blockLines: string[] = [];
      cursor += 1;
      while (cursor < lines.length && !closer.test(lines[cursor])) {
        blockLines.push(lines[cursor]);
        cursor += 1;
      }
      if (cursor >= lines.length) {
        throw new Error(`Content block "${type}" is missing a closing fence`);
      }

      const item = currentItem();
      if (item) {
        item.blocks.push({ type, body: blockLines.join("\n").trim() });
      } else if (inTemplateDescription()) {
        descriptionLines.push(line, ...blockLines, lines[cursor]);
      }
      cursor += 1;
      continue;
    }

    const sectionHeading = SECTION_HEADING.exec(line);
    const itemHeading = inTemplateDescription() ? null : ITEM_HEADING.exec(line);
    if (sectionHeading) {
      sections.push({ title: sectionHeading[1].trim(), items: [] });
    } else if (itemHeading) {
      currentSection().items.push({ title: itemHeading[1].trim(), description: "", blocks: [], lines: [] });
    } else if (inTemplateDescription()) {
      descriptionLines.push(unescapeDescriptionLine(line));
    } else {
      currentItem()?.lines.push(unescapeDescriptionLine(line));
    }
    cursor += 1;
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
