const SECTION_PREFIX = "## ";
const ITEM_PREFIX = "### ";
const SECTION_HEADING = /^## .+$/;
const ITEM_HEADING = /^### .+$/;
const BLOCK_OPENER = /^`{3,}serplists:.*$/;
const BLOCK_TYPE_PREFIX = "serplists:";
const MIN_FENCE_LENGTH = 3;
const STRUCTURAL_LINE_ESCAPED_OR_NOT = /^\\*(?:#{2,3} |`{3,}serplists:)/;
const ESCAPED_STRUCTURAL_LINE = /^\\+(?:#{2,3} |`{3,}serplists:)/;

type TemplateMarkdownBlock = { type: string; body: string };
type TemplateMarkdownItem = {
  title: string;
  description: string;
  blocks: TemplateMarkdownBlock[];
};
type TemplateMarkdownSection = { title: string; items: TemplateMarkdownItem[] };
export type TemplateMarkdownBody = {
  description: string;
  sections: TemplateMarkdownSection[];
};

const leadingBacktickRun = (line: string): number => {
  const text = line.trimStart();
  return text.length - text.replace(/^`+/, "").length;
};

const longestLeadingBacktickRun = (value: string): number =>
  value.split("\n").reduce((longest, line) => Math.max(longest, leadingBacktickRun(line)), 0);

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
  const lines = body.split("\n")[Symbol.iterator]();
  const descriptionLines: string[] = [];
  const sections: Array<{ title: string; items: Array<TemplateMarkdownItem & { lines: string[] }> }> = [];

  for (let next = lines.next(); !next.done; next = lines.next()) {
    const line = next.value;
    const section = sections.at(-1);
    if (BLOCK_OPENER.test(line)) {
      const fenceLength = line.length - line.replace(/^`+/, "").length;
      const type = line.slice(fenceLength + BLOCK_TYPE_PREFIX.length).trim();
      const closer = new RegExp(`^\`{${fenceLength}}\\s*$`);
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

    if (SECTION_HEADING.test(line)) {
      sections.push({ title: line.slice(SECTION_PREFIX.length).trim(), items: [] });
    } else if (section && ITEM_HEADING.test(line)) {
      section.items.push({ title: line.slice(ITEM_PREFIX.length).trim(), description: "", blocks: [], lines: [] });
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
