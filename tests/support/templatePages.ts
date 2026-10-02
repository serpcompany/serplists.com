import type { McpRecord } from './mcpResponses';
import { jsonObject, jsonObjects } from './readJson';

type JsonRecord = Record<string, unknown>;

export interface PagedResult extends McpRecord {
  firstRetired?: unknown;
}

interface TextPart extends JsonRecord {
  of?: unknown;
  from?: unknown;
  to?: unknown;
  length?: unknown;
  text?: unknown;
}

interface PagedSection extends JsonRecord {
  taskCount?: unknown;
}

export interface OutlineEntry extends JsonRecord {
  id?: unknown;
}

export type PagedRead = (args: JsonRecord) => Promise<PagedResult> | PagedResult;
export type TemplateRead = PagedRead;

export const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isTextPart: (value: unknown) => value is TextPart = isRecord;

export function jsonTextPartsJoiner() {
  let text = '';
  let expectedFrom = 0;
  return (part: TextPart): unknown => {
    if (part.from !== expectedFrom) throw new Error(`part starts at ${String(part.from)}, expected ${expectedFrom}`);
    text += String(part.text);
    expectedFrom = Number(part.to);
    if (part.to !== part.length) return undefined;
    const value: unknown = JSON.parse(text);
    text = '';
    expectedFrom = 0;
    return value;
  };
}

export async function readSectionInFull(call: PagedRead, sectionId: unknown): Promise<JsonRecord> {
  let page = await call({ sectionId });
  const first: PagedSection | undefined = jsonObject.optional().parse(page.section);
  if (first && typeof first.taskCount !== 'number') return first;

  const addPart = jsonTextPartsJoiner();
  let fieldsSentInParts: JsonRecord | undefined;
  let fieldsOnTheFirstPage: JsonRecord | undefined;
  const tasks: JsonRecord[] = [];
  for (;;) {
    if (isTextPart(page.part)) {
      const completedUnit = addPart(page.part);
      if (isRecord(completedUnit)) {
        if (page.part.of === 'section') fieldsSentInParts = completedUnit;
        else tasks.push(completedUnit);
      }
    } else {
      const { taskCount, firstTask, items, ...rest } = jsonObject.parse(page.section);
      fieldsOnTheFirstPage ??= rest;
      if (firstTask !== tasks.length) throw new Error(`page starts at task ${String(firstTask)}, expected ${tasks.length}`);
      tasks.push(...jsonObjects.parse(items));
    }
    if (typeof page.nextCursor !== 'string') break;
    page = await call({ cursor: page.nextCursor });
  }
  return { ...(fieldsSentInParts ?? fieldsOnTheFirstPage), items: tasks };
}

export async function readOutlineFromItsFirstPage(
  call: PagedRead,
  firstPage: PagedResult,
  fieldsKey: 'template' | 'run',
): Promise<{ fields: JsonRecord; outline: OutlineEntry[] }> {
  const addPart = jsonTextPartsJoiner();
  let fieldsSentInParts: JsonRecord | undefined;
  let fieldsOnTheFirstPage: JsonRecord | undefined;
  const outline: OutlineEntry[] = [];
  let page = firstPage;
  for (;;) {
    if (isTextPart(page.part)) {
      const completedUnit = addPart(page.part);
      if (isRecord(completedUnit)) {
        if (page.part.of === fieldsKey) fieldsSentInParts = completedUnit;
        else outline.push(completedUnit);
      }
    } else {
      fieldsOnTheFirstPage ??= jsonObject.optional().parse(page[fieldsKey]);
      outline.push(...jsonObjects.parse(page.outline));
    }
    if (typeof page.nextCursor !== 'string') break;
    page = await call({ cursor: page.nextCursor });
  }
  return { fields: fieldsSentInParts ?? fieldsOnTheFirstPage ?? {}, outline };
}

export function callRecordingResults(read: PagedRead, argumentsOfEveryCall: JsonRecord, results: PagedResult[]): PagedRead {
  return async (args: JsonRecord) => {
    const result = await read({ ...argumentsOfEveryCall, ...args });
    results.push(result);
    return result;
  };
}

export async function readTemplateInFull(
  read: TemplateRead,
  templateId: string,
): Promise<{ template: McpRecord; results: PagedResult[] }> {
  const results: PagedResult[] = [];
  const call = callRecordingResults(read, { templateId }, results);

  const page = await call({});
  if (page.sectionsOmitted !== true) return { template: jsonObject.parse(page.template), results };

  const { fields, outline } = await readOutlineFromItsFirstPage(call, page, 'template');
  const sections: JsonRecord[] = [];
  for (const entry of outline) sections.push(await readSectionInFull(call, entry.id));
  const { sectionCount, taskCount, bytes, ...header } = fields;
  return { template: { ...header, sections }, results };
}
