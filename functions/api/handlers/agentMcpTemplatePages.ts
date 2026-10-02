import type { schema } from "../db";
import type { JsonRecord, SectionRecord } from "../../../src/lib/schemas/jsonRecords";
import { sanitizeStoredSections } from "../../../src/lib/schemas/storedSections";
import { normalizeSectionsPayload, normalizeStringArray, parseJsonArray } from "../utils/payloads";
import { withStableTemplateIdentities } from "../utils/template-identities";
import {
  boundedText,
  continuePage,
  decodeCursor,
  describePage,
  findTask,
  fits,
  frameId,
  invalidCursor,
  outlinePage,
  readCursorSchema,
  readSectionOrTask,
  START,
  tasksOf,
  titleOf,
  type Paged,
  type ToolResult,
} from "./agentMcpPages";
import { ToolError, type SectionAndTaskIds } from "./agentMcpTools";

type TemplateRow = typeof schema.templates.$inferSelect;

type TemplateViewFields = Partial<Pick<
  TemplateRow,
  "id" | "title" | "description" | "type" | "category" | "tags" | "version" | "content_version" | "created_at" | "updated_at" | "items"
>>;

type TemplateHeader = ReturnType<typeof templateHeader>;

export type TemplateView = { header: TemplateHeader; sections: SectionRecord[] };

export function templateSections(items: unknown): SectionRecord[] {
  const { sections } = normalizeSectionsPayload(parseJsonArray(items) ?? []);
  return sanitizeStoredSections(withStableTemplateIdentities(sections))
    .map((section) => (Array.isArray(section.items) ? section : { ...section, items: [] }));
}

function templateHeader(row: TemplateViewFields) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    type: row.type,
    categories: normalizeStringArray(row.category),
    tags: normalizeStringArray(row.tags),
    version: typeof row.version === "number" ? row.version : 1,
    contentVersion: row.content_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function templateView(row: TemplateViewFields): TemplateView {
  return { header: templateHeader(row), sections: templateSections(row.items) };
}

const wholeTemplate = ({ header, sections }: TemplateView): JsonRecord => ({ template: { ...header, sections } });

function pagedTemplate(header: TemplateHeader): Paged {
  return {
    key: "template",
    ref: { id: header.id, version: header.version, contentVersion: header.contentVersion },
    id: String(header.id),
    version: Number(header.version),
  };
}

function continueRead(view: TemplateView, value: string, args: SectionAndTaskIds): JsonRecord {
  const cursor = decodeCursor(value, readCursorSchema, "get_template");
  const { header, sections } = view;
  if (cursor.t !== header.id) throw invalidCursor("It belongs to another template");
  if (cursor.v !== header.version) {
    throw new ToolError("Template changed since this read started; read it again without a cursor", "edit_conflict", {
      expectedVersion: cursor.v,
      currentVersion: header.version,
    });
  }
  return continuePage(pagedTemplate(header), header, sections, cursor, args);
}

export function readTemplate(view: TemplateView, args: SectionAndTaskIds & { cursor?: string | undefined }): JsonRecord {
  if (args.cursor !== undefined) return continueRead(view, args.cursor, args);
  const sectionOrTask = readSectionOrTask(pagedTemplate(view.header), view.sections, args);
  if (sectionOrTask) return sectionOrTask;
  const whole = wholeTemplate(view);
  return fits(whole) ? whole : outlinePage(pagedTemplate(view.header), view.header, view.sections, START);
}

export function describeTemplateRead(result: ToolResult): string {
  return describePage(result, "get_template", "Template") ?? `Loaded template "${boundedText(titleOf(result.template))}".`;
}

function locateTask(sections: SectionRecord[], taskId: string | undefined) {
  if (taskId === undefined) return undefined;
  try {
    return findTask(sections, taskId);
  } catch {
    return undefined;
  }
}

export function writtenTemplateResult(view: TemplateView, changed: SectionAndTaskIds = {}): JsonRecord {
  const { header, sections } = view;
  const taskAt = locateTask(sections, changed.taskId);
  const sectionIndex = taskAt?.sectionIndex
    ?? (changed.sectionId === undefined ? -1 : sections.findIndex((section) => section.id === changed.sectionId));
  const section = sectionIndex >= 0 ? sections[sectionIndex] : undefined;
  const ids = { ...(section ? frameId("sectionId", section.id) : {}), ...(taskAt ? frameId("taskId", changed.taskId) : {}) };
  const minimal = {
    template: { id: header.id, title: boundedText(header.title), version: header.version, contentVersion: header.contentVersion },
    sectionsOmitted: true,
  };
  const withFields = { template: header, sectionsOmitted: true };
  const summary = fits(withFields) ? withFields : minimal;
  const changedPart = taskAt && section
    ? { task: tasksOf(section)[taskAt.taskIndex] }
    : section ? { section } : {};
  const candidates: JsonRecord[] = [
    { ...wholeTemplate(view), ...ids },
    { ...summary, ...ids, ...changedPart },
    { ...summary, ...ids },
    summary,
  ];
  return candidates.find(fits) ?? minimal;
}
