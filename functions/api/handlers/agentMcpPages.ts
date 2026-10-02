import { z } from "zod";
import {
  isRecord,
  taskRecordsIn,
  type JsonRecord,
  type SectionRecord,
  type TaskRecord,
} from "../../../src/lib/schemas/jsonRecords";
import { ToolError, type SectionAndTaskIds } from "./agentMcpTools";

export interface ToolResult extends JsonRecord {
  template?: unknown;
  run?: unknown;
  section?: unknown;
  task?: unknown;
  part?: unknown;
  nextCursor?: unknown;
  sectionsOmitted?: unknown;
  taskOmitted?: unknown;
  retiredItems?: unknown;
  retiredCount?: unknown;
  firstRetired?: unknown;
}

interface TitledRecord extends JsonRecord {
  title?: unknown;
}

interface ResultPart extends JsonRecord {
  of?: unknown;
}

interface ResultSection extends TitledRecord {
  taskCount?: unknown;
  firstTask?: unknown;
  items?: unknown;
}

const isTitledRecord: (value: unknown) => value is TitledRecord = isRecord;
const isResultPart: (value: unknown) => value is ResultPart = isRecord;
const isResultSection: (value: unknown) => value is ResultSection = isRecord;

export const titleOf = (value: unknown): unknown => (isTitledRecord(value) ? value.title : undefined);

export const MAX_RESULT_BYTES = 32 * 1024;

export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

export function toWellFormedText(text: string): string {
  return text.replace(LONE_SURROGATE, "�");
}

const isHighSurrogate = (code: number) => code >= 0xd800 && code <= 0xdbff;

export function boundedText(value: unknown, maxUtf16Units = 160): string {
  const text = toWellFormedText(typeof value === "string" ? value : "Untitled");
  if (text.length <= maxUtf16Units) return text;
  let end = maxUtf16Units - 1;
  const cutsSurrogatePair = end > 0 && isHighSurrogate(text.charCodeAt(end - 1));
  if (cutsSurrogatePair) end -= 1;
  return `${text.slice(0, end)}…`;
}

const wellFormedStrings = (_key: string, value: unknown) => (typeof value === "string" ? toWellFormedText(value) : value);

export const toJson = (value: unknown): string => JSON.stringify(value, wellFormedStrings);
export const byteSize = (value: unknown): number => utf8ByteLength(toJson(value));
export const fits = (result: JsonRecord): boolean => byteSize(result) <= MAX_RESULT_BYTES;

export const resultTooLarge = () => new ToolError("Result is too large to return", "result_too_large", { limit: MAX_RESULT_BYTES });

export function bounded(page: JsonRecord): JsonRecord {
  if (fits(page)) return page;
  throw resultTooLarge();
}

export const tasksOf = (section: SectionRecord): TaskRecord[] => taskRecordsIn(section.items);

export function findSection(sections: SectionRecord[], sectionId: string, idArgumentName = "sectionId"): number {
  const index = sections.findIndex((section) => section.id === sectionId);
  if (index < 0) throw new ToolError(`Section not found (${idArgumentName})`, "section_not_found");
  return index;
}

export function sectionAt<Section extends SectionRecord>(sections: Section[], index: number): Section {
  const section = sections[index];
  if (!section) throw new ToolError("Section not found", "section_not_found");
  return section;
}

export function findTask(
  sections: SectionRecord[],
  taskId: string,
  sectionId?: string,
  idArgumentName = "taskId",
): { sectionIndex: number; taskIndex: number } {
  const candidates = sectionId === undefined ? sections.map((_, index) => index) : [findSection(sections, sectionId)];
  for (const sectionIndex of candidates) {
    const taskIndex = tasksOf(sectionAt(sections, sectionIndex)).findIndex((task) => task.id === taskId);
    if (taskIndex >= 0) return { sectionIndex, taskIndex };
  }
  throw new ToolError(
    `Task not found (${sectionId === undefined ? idArgumentName : `${idArgumentName} in sectionId`})`,
    "task_not_found",
  );
}

const MAX_FRAME_ID_BYTES = 1024;

export const frameId = (key: string, id: unknown): JsonRecord =>
  (typeof id === "string" && utf8ByteLength(id) <= MAX_FRAME_ID_BYTES ? { [key]: id } : {});

export function encodeCursor(cursor: JsonRecord): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(JSON.stringify(cursor))) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export const invalidCursor = (message: string) =>
  new ToolError(`cursor: ${message}`, "invalid_arguments", { issues: [{ path: "cursor", message }] });

function parseCursor<Cursor>(value: string, schema: z.ZodType<Cursor, z.ZodTypeDef, unknown>): Cursor | undefined {
  try {
    const bytes = Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), (character) => character.charCodeAt(0));
    const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
    const cursor: unknown = JSON.parse(text);
    const parsed = schema.safeParse(cursor);
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export function decodeCursor<Cursor>(value: string, schema: z.ZodType<Cursor, z.ZodTypeDef, unknown>, tool: string): Cursor {
  const cursor = parseCursor(value, schema);
  if (cursor === undefined) throw invalidCursor(`Not a cursor ${tool} returned`);
  return cursor;
}

export const readCursorSchema = z.object({
  t: z.string(),
  v: z.number().int().positive(),
  m: z.enum(["outline", "section", "task", "retired"]),
  s: z.number().int().nonnegative().optional(),
  k: z.number().int().nonnegative().optional(),
  rs: z.string().optional(),
  rt: z.string().optional(),
  u: z.number().int().nonnegative(),
  o: z.number().int().nonnegative(),
}).strict();

export type ReadCursor = z.infer<typeof readCursorSchema>;
export type ReadScope = Omit<ReadCursor, "t" | "v" | "u" | "o">;

export type Unit = { json: string; bytes: number };
export type Position = { unit: number; offset: number };
type Part = { unit: number; from: number; to: number; length: number; text: string };
export type Packed = { first: number; count: number; part?: Part; next?: Position };

export const START: Position = { unit: 0, offset: 0 };

const CURSOR_AND_OFFSETS_RESERVE_BYTES = 512;
const SEPARATOR_BYTES = 1;
const JSON_STRING_QUOTES_BYTES = 2;
const SHORT_ESCAPE_BYTES = 2;
const UNICODE_ESCAPE_BYTES = 6;
const SURROGATE_PAIR_UTF8_BYTES = 4;

export const unitOf = (value: unknown): Unit => {
  const json = toJson(value);
  return { json, bytes: utf8ByteLength(json) };
};

function jsonStringBytes(codeUnit: number): number {
  if (codeUnit === 0x22 || codeUnit === 0x5c) return SHORT_ESCAPE_BYTES;
  if (codeUnit < 0x20) {
    const hasShortEscape = codeUnit === 0x08 || codeUnit === 0x09 || codeUnit === 0x0a || codeUnit === 0x0c || codeUnit === 0x0d;
    return hasShortEscape ? SHORT_ESCAPE_BYTES : UNICODE_ESCAPE_BYTES;
  }
  if (codeUnit < 0x80) return 1;
  return codeUnit < 0x800 ? 2 : 3;
}

function partEndWithinBytes(json: string, from: number, maxBytes: number): number {
  let bytes = JSON_STRING_QUOTES_BYTES;
  let index = from;
  while (index < json.length) {
    const code = json.charCodeAt(index);
    const isSurrogatePair = code >= 0xd800 && code <= 0xdbff && (json.charCodeAt(index + 1) & 0xfc00) === 0xdc00;
    const isLoneSurrogate = !isSurrogatePair && code >= 0xd800 && code <= 0xdfff;
    const width = isSurrogatePair
      ? SURROGATE_PAIR_UTF8_BYTES
      : isLoneSurrogate ? UNICODE_ESCAPE_BYTES : jsonStringBytes(code);
    if (bytes + width > maxBytes) break;
    bytes += width;
    index += isSurrogatePair ? 2 : 1;
  }
  return index;
}

export function pack(units: Unit[], start: Position, room: number): Packed {
  const unit = units[start.unit];
  if (!unit || (start.offset > 0 && start.offset >= unit.json.length)) throw invalidCursor("It points past the end");
  if (start.offset === 0) {
    let used = 0;
    let count = 0;
    for (let next = units[start.unit]; next && used + next.bytes + SEPARATOR_BYTES <= room; next = units[start.unit + count]) {
      used += next.bytes + SEPARATOR_BYTES;
      count += 1;
    }
    if (count > 0) {
      const nextUnit = start.unit + count;
      return { first: start.unit, count, ...(nextUnit < units.length ? { next: { unit: nextUnit, offset: 0 } } : {}) };
    }
  }
  const to = partEndWithinBytes(unit.json, start.offset, room);
  const partWouldBeEmpty = to === start.offset;
  if (partWouldBeEmpty) throw resultTooLarge();
  const next = to < unit.json.length
    ? { unit: start.unit, offset: to }
    : start.unit + 1 < units.length ? { unit: start.unit + 1, offset: 0 } : undefined;
  const part = { unit: start.unit, from: start.offset, to, length: unit.json.length, text: unit.json.slice(start.offset, to) };
  return { first: start.unit, count: 0, part, ...(next ? { next } : {}) };
}

export const roomForUnits = (frame: JsonRecord) => MAX_RESULT_BYTES - byteSize(frame) - CURSOR_AND_OFFSETS_RESERVE_BYTES;

export type Paged = { key: "template" | "run"; ref: JsonRecord; id: string; version: number };

export function partAndNextCursor(paged: Paged, packed: Packed, scope: ReadScope, partOf: (unit: number) => JsonRecord): JsonRecord {
  const { part, next } = packed;
  const cursor: ReadCursor | undefined = next ? { t: paged.id, v: paged.version, ...scope, u: next.unit, o: next.offset } : undefined;
  return {
    ...(part ? { part: { ...partOf(part.unit), from: part.from, to: part.to, length: part.length, text: part.text } } : {}),
    ...(cursor ? { nextCursor: encodeCursor(cursor) } : {}),
  };
}

function jsonArrayBytes(itemBytes: number[]): number {
  const commas = Math.max(itemBytes.length - 1, 0);
  const brackets = 2;
  return itemBytes.reduce((total, size) => total + size, 0) + commas + brackets;
}

export function outlinePage(paged: Paged, header: JsonRecord, sections: SectionRecord[], start: Position, extra: JsonRecord = {}): JsonRecord {
  const sizes = sections.map(byteSize);
  const fields = {
    ...header,
    sectionCount: sections.length,
    taskCount: sections.reduce((total, section) => total + tasksOf(section).length, 0),
    bytes: jsonArrayBytes(sizes),
    ...extra,
  };
  const values: JsonRecord[] = [fields, ...sections.map((section, index) => ({
    id: section.id,
    title: typeof section.title === "string" ? boundedText(section.title) : null,
    taskCount: tasksOf(section).length,
    bytes: sizes[index],
  }))];
  const frame = { [paged.key]: paged.ref, sectionsOmitted: true, outline: [], limit: MAX_RESULT_BYTES };
  const packed = pack(values.map(unitOf), start, roomForUnits(frame));
  const included = values.slice(packed.first, packed.first + packed.count);
  const withFields = packed.first === 0 && packed.count > 0;
  return bounded({
    [paged.key]: withFields ? included[0] : paged.ref,
    sectionsOmitted: true,
    outline: withFields ? included.slice(1) : included,
    limit: MAX_RESULT_BYTES,
    ...partAndNextCursor(paged, packed, { m: "outline" }, (unit) => (unit === 0 ? { of: paged.key } : { of: "outline", index: unit - 1 })),
  });
}

export function sectionPage(paged: Paged, sections: SectionRecord[], sectionIndex: number, start: Position): JsonRecord {
  const fieldsUnit = 0;
  const firstTaskUnit = 1;
  const section = sectionAt(sections, sectionIndex);
  const { items: _items, ...fields } = section;
  const tasks = tasksOf(section);
  const values: JsonRecord[] = [fields, ...tasks];
  const frame = { [paged.key]: paged.ref, section: { ...frameId("id", section.id), taskCount: tasks.length, firstTask: tasks.length, items: [] } };
  const packed = pack(values.map(unitOf), start, roomForUnits(frame));
  const withFields = packed.first === fieldsUnit && packed.count > 0;
  return bounded({
    [paged.key]: paged.ref,
    section: {
      ...(withFields ? fields : frameId("id", section.id)),
      taskCount: tasks.length,
      firstTask: Math.max(packed.first - firstTaskUnit, 0),
      items: values.slice(Math.max(packed.first, firstTaskUnit), packed.first + packed.count),
    },
    ...partAndNextCursor(paged, packed, { m: "section", s: sectionIndex }, (unit) =>
      (unit === fieldsUnit ? { of: "section", index: sectionIndex } : { of: "task", index: unit - firstTaskUnit })),
  });
}

export function taskPage(paged: Paged, sections: SectionRecord[], sectionIndex: number, taskIndex: number, start: Position): JsonRecord {
  const section = sectionAt(sections, sectionIndex);
  const task = tasksOf(section)[taskIndex];
  const frame = { [paged.key]: paged.ref, ...frameId("sectionId", section.id) };
  const packed = pack([unitOf(task)], start, roomForUnits(frame));
  return bounded({
    ...frame,
    ...(packed.count > 0 ? { task } : {}),
    ...partAndNextCursor(paged, packed, { m: "task", s: sectionIndex, k: taskIndex }, () => ({ of: "task", index: taskIndex })),
  });
}

export function readSectionOrTask(paged: Paged, sections: SectionRecord[], { sectionId, taskId }: SectionAndTaskIds): JsonRecord | null {
  if (taskId !== undefined) {
    const { sectionIndex, taskIndex } = findTask(sections, taskId, sectionId);
    const section = sectionAt(sections, sectionIndex);
    const whole = { [paged.key]: paged.ref, sectionId: section.id, task: tasksOf(section)[taskIndex] };
    return fits(whole) ? whole : taskPage(paged, sections, sectionIndex, taskIndex, START);
  }
  if (sectionId === undefined) return null;
  const sectionIndex = findSection(sections, sectionId);
  const whole = { [paged.key]: paged.ref, section: sections[sectionIndex] };
  return fits(whole) ? whole : sectionPage(paged, sections, sectionIndex, START);
}

export function continuePage(
  paged: Paged,
  header: JsonRecord,
  sections: SectionRecord[],
  cursor: ReadCursor,
  args: SectionAndTaskIds,
  outlineExtra: JsonRecord = {},
): JsonRecord {
  const sectionIndex = cursor.m === "outline" ? undefined : cursor.s;
  const section = sectionIndex === undefined ? undefined : sections[sectionIndex];
  const taskIndex = section && cursor.m === "task" ? cursor.k : undefined;
  const task = section && taskIndex !== undefined ? tasksOf(section)[taskIndex] : undefined;
  if (cursor.m === "retired" || (cursor.m !== "outline" && !section) || (cursor.m === "task" && !task)) {
    throw invalidCursor("It points past the end");
  }
  if ((args.sectionId !== undefined && args.sectionId !== section?.id) || (args.taskId !== undefined && args.taskId !== task?.id)) {
    throw invalidCursor(`It continues another read; pass it with ${paged.key}Id alone`);
  }
  const start = { unit: cursor.u, offset: cursor.o };
  if (sectionIndex === undefined) return outlinePage(paged, header, sections, start, outlineExtra);
  if (taskIndex === undefined) return sectionPage(paged, sections, sectionIndex, start);
  return taskPage(paged, sections, sectionIndex, taskIndex, start);
}

export function describePage(result: ToolResult, tool: string, noun: "Template" | "Run"): string | null {
  const more = typeof result.nextCursor === "string" ? ` More follows: call ${tool} with cursor set to nextCursor.` : "";
  if (isResultPart(result.part)) {
    const of = String(result.part.of);
    return `Loaded part of ${/^[aeiou]/.test(of) ? "an" : "a"} ${of} too large for one result; join its parts' text in order.${more}`;
  }
  if (result.sectionsOmitted === true) {
    const title = titleOf(result[noun.toLowerCase()]);
    const name = typeof title === "string" ? `${noun} "${boundedText(title)}"` : `This ${noun.toLowerCase()}`;
    return `${name} is too large to return at once, so this is its outline; read a section with sectionId.${more}`;
  }
  if (isTitledRecord(result.task)) return `Loaded task "${boundedText(result.task.title)}".`;
  if (isResultSection(result.section)) {
    const { section } = result;
    if (typeof section.taskCount !== "number" || typeof section.firstTask !== "number") {
      return `Loaded section "${boundedText(section.title)}".`;
    }
    const count = Array.isArray(section.items) ? section.items.length : 0;
    const tasks = count === 0 ? "none" : `${section.firstTask + 1}-${section.firstTask + count}`;
    return `Loaded tasks ${tasks} of the ${section.taskCount} in a section too large for one result.${more}`;
  }
  return null;
}
