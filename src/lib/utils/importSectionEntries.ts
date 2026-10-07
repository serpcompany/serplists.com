import { isContentRecord, isRecord, isSectionRecord, isTaskRecord } from "@/lib/schemas/jsonRecords";

const quoted = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? `"${value.trim()}"` : null;

const describeTextOrObject = (value: unknown, where: string): string | null => {
  if (typeof value === "string") return value.trim() ? null : `${where} is empty`;
  return isRecord(value) ? null : `${where} must be text or an object with a title`;
};

const findInvalidContentEntry = (contents: unknown, task: string): string | null => {
  if (!Array.isArray(contents)) return null;
  for (const [contentIndex, content] of contents.entries()) {
    if (!isContentRecord(content)) return `content block ${contentIndex + 1} of ${task} must be an object`;
    if (content.type === "form" && Array.isArray(content.fields)) {
      const fieldIndex = content.fields.findIndex((field) => !isRecord(field));
      if (fieldIndex >= 0) return `form field ${fieldIndex + 1} of ${task} must be an object with a label and a kind`;
    }
    if (content.type !== "subItems" || !Array.isArray(content.subItems)) continue;
    for (const [subItemIndex, subItem] of content.subItems.entries()) {
      const problem = describeTextOrObject(subItem, `sub-task ${subItemIndex + 1} of ${task}`);
      if (problem) return problem;
    }
  }
  return null;
};

export function findInvalidImportSectionEntry(sections: unknown[]): string | null {
  for (const [sectionIndex, section] of sections.entries()) {
    if (!isSectionRecord(section)) {
      return `section ${sectionIndex + 1} must be an object with a title and tasks`;
    }
    const sectionName = `section ${quoted(section.title) ?? sectionIndex + 1}`;
    const items = Array.isArray(section.items) ? section.items : [];
    for (const [itemIndex, item] of items.entries()) {
      const position = `task ${itemIndex + 1} in ${sectionName}`;
      const problem = describeTextOrObject(item, position);
      if (problem) return problem;
      if (!isTaskRecord(item)) continue;
      const task = quoted(item.title) ? `task ${quoted(item.title)}` : position;
      const contentProblem = findInvalidContentEntry(item.contents, task);
      if (contentProblem) return contentProblem;
    }
  }
  return null;
}
