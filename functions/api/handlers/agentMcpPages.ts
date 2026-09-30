import { z } from "zod";
import { isRecord, ToolError, type JsonRecord } from "./agentMcpTools";

// What every personal run MCP tool result holds (functions/api/handlers/agentMcp.ts): the bound
// each one stays within, how a result is measured, and the reads that return anything larger a
// part at a time. get_template and get_run share the pages: an outline of a template's or run's
// sections, a section a page of whole tasks at a time, and a task, with anything too large for a
// result on its own (a very long task, a section's or template's fields) in parts of its JSON
// text. A page with more to read has nextCursor, which holds the version or revision the read
// started from, so a read never mixes two versions.

/**
 * The largest result any tool returns, in bytes of the JSON clients receive, so that MCP clients
 * take every one whole. Claude Code sets a result over MAX_MCP_OUTPUT_TOKENS (25,000 tokens by
 * default) aside in a file, and Codex cuts the middle out of one over its model's budget (10,000
 * tokens plus 20%, which it counts as 4 bytes each: 48,000 bytes). 32KB is 8,192 of Codex's
 * tokens, and about 16,000 real ones even at 2 bytes a token (JSON dense with ids, or text in
 * other scripts). The tool descriptions in agentMcpTemplateTools.ts and agentMcpTools.ts name it.
 */
export const MAX_RESULT_BYTES = 32 * 1024;

// ---- Text -----------------------------------------------------------------------------

export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

// A UTF-16 surrogate half without its partner. JSON.stringify writes one as a "\ud83d"
// escape, and strict JSON parsers (serde_json in Codex's MCP client) reject the whole
// response. Stored text can already hold one: JSON request bodies accept them.
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

// String.prototype.toWellFormed (ES2024) without the newer lib typings.
export function toWellFormedText(text: string): string {
  return text.replace(LONE_SURROGATE, "�");
}

const isHighSurrogate = (code: number) => code >= 0xd800 && code <= 0xdbff;

// At most `maximum` UTF-16 units, cut on a character boundary.
export function boundedText(value: unknown, maximum = 160): string {
  const text = toWellFormedText(typeof value === "string" ? value : "Untitled");
  if (text.length <= maximum) return text;
  let end = maximum - 1;
  // Never keep the first half of a surrogate pair (an emoji, for example).
  if (end > 0 && isHighSurrogate(text.charCodeAt(end - 1))) end -= 1;
  return `${text.slice(0, end)}…`;
}

// agentMcp.ts sends every string well formed, so results are measured and sliced the same way.
const wellFormed = (_key: string, value: unknown) => (typeof value === "string" ? toWellFormedText(value) : value);

/** JSON text as clients receive it: every string well formed. */
export const toJson = (value: unknown): string => JSON.stringify(value, wellFormed);
export const byteSize = (value: unknown): number => utf8ByteLength(toJson(value));
export const fits = (result: JsonRecord): boolean => byteSize(result) <= MAX_RESULT_BYTES;

export const resultTooLarge = () => new ToolError("Result is too large to return", "result_too_large", { limit: MAX_RESULT_BYTES });

// Every page is built to fit; checked again so that a mistake can only fail a read.
export function bounded(page: JsonRecord): JsonRecord {
  if (fits(page)) return page;
  throw resultTooLarge();
}

// ---- Sections and tasks ---------------------------------------------------------------

export const tasksOf = (section: JsonRecord): JsonRecord[] =>
  (Array.isArray(section.items) ? section.items.filter(isRecord) : []);

// `argument` names the argument that held the id, for an operation that takes several.
export function findSection(sections: JsonRecord[], sectionId: string, argument = "sectionId"): number {
  const index = sections.findIndex((section) => section.id === sectionId);
  if (index < 0) throw new ToolError(`Section not found (${argument})`, "section_not_found");
  return index;
}

/** The task with `taskId`, in the section with `sectionId` when one is given. */
export function findTask(
  sections: JsonRecord[],
  taskId: string,
  sectionId?: string,
  argument = "taskId",
): { sectionIndex: number; taskIndex: number } {
  const candidates = sectionId === undefined ? sections.map((_, index) => index) : [findSection(sections, sectionId)];
  for (const sectionIndex of candidates) {
    const taskIndex = tasksOf(sections[sectionIndex]).findIndex((task) => task.id === taskId);
    if (taskIndex >= 0) return { sectionIndex, taskIndex };
  }
  throw new ToolError(`Task not found (${sectionId === undefined ? argument : `${argument} in sectionId`})`, "task_not_found");
}

// A page's frame leaves out a longer id (the page with that section or task carries it), so no id
// can push a frame past the bound. Ids the app makes are under 50 characters.
const MAX_FRAME_ID_BYTES = 1024;

export const frameId = (key: string, id: unknown): JsonRecord =>
  (typeof id === "string" && utf8ByteLength(id) <= MAX_FRAME_ID_BYTES ? { [key]: id } : {});

// ---- Cursors --------------------------------------------------------------------------

// Cursors are base64url JSON, never parsed for anything but the position they hold, and checked
// against the template or run before use.
export function encodeCursor(cursor: JsonRecord): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(JSON.stringify(cursor))) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export const invalidCursor = (message: string) =>
  new ToolError(`cursor: ${message}`, "invalid_arguments", { issues: [{ path: "cursor", message }] });

/** The cursor `value` holds, when `tool` made it; invalid arguments otherwise. */
export function decodeCursor<Schema extends z.ZodTypeAny>(value: string, schema: Schema, tool: string): z.infer<Schema> {
  try {
    const bytes = Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), (character) => character.charCodeAt(0));
    const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
    const parsed = schema.safeParse(JSON.parse(text));
    if (parsed.success) return parsed.data;
  } catch {
    // Reported below, like any other value the tool did not return.
  }
  throw invalidCursor(`Not a cursor ${tool} returned`);
}

// Where a read of a template or run continues.
export const readCursorSchema = z.object({
  t: z.string(), // the template's or run's id
  v: z.number().int().positive(), // the template version or run revision the read started from
  m: z.enum(["outline", "section", "task", "retired"]),
  s: z.number().int().nonnegative().optional(), // section index
  k: z.number().int().nonnegative().optional(), // task index, in a task read
  rs: z.string().optional(), // the sectionId a read of retired work names
  rt: z.string().optional(), // the taskId a read of retired work names
  u: z.number().int().nonnegative(), // the next unit to return
  o: z.number().int().nonnegative(), // how far into that unit's JSON text, in a part
}).strict();

export type ReadCursor = z.infer<typeof readCursorSchema>;
export type ReadScope = Omit<ReadCursor, "t" | "v" | "u" | "o">;

// ---- Units and parts ------------------------------------------------------------------

// A page returns units (a template's or run's fields, an outline entry, a section's fields, a
// task, a retired entry) in order, whole while they fit. One too large for a page on its own
// comes back in parts: consecutive slices of its JSON text.
export type Unit = { json: string; bytes: number };
export type Position = { unit: number; offset: number };
type Part = { unit: number; from: number; to: number; length: number; text: string };
export type Packed = { first: number; count: number; part?: Part; next?: Position };

export const START: Position = { unit: 0, offset: 0 };

// Room every page keeps for nextCursor and a part's offsets.
const PAGE_RESERVE_BYTES = 512;

export const unitOf = (value: unknown): Unit => {
  const json = toJson(value);
  return { json, bytes: utf8ByteLength(json) };
};

// Bytes a UTF-16 code unit takes inside a JSON string: its escape, or its UTF-8 length.
function escapedBytes(code: number): number {
  if (code === 0x22 || code === 0x5c) return 2;
  if (code < 0x20) return code === 0x08 || code === 0x09 || code === 0x0a || code === 0x0c || code === 0x0d ? 2 : 6;
  if (code < 0x80) return 1;
  return code < 0x800 ? 2 : 3;
}

/** Where the part of `json` from `from` ends, so that it takes at most `maxBytes` as a JSON string. */
function partEnd(json: string, from: number, maxBytes: number): number {
  let bytes = 2; // the quotes
  let index = from;
  while (index < json.length) {
    const code = json.charCodeAt(index);
    const pair = code >= 0xd800 && code <= 0xdbff && (json.charCodeAt(index + 1) & 0xfc00) === 0xdc00;
    // A surrogate pair is never split. JSON.stringify leaves no lone half, but one would be escaped.
    const width = pair ? 4 : code >= 0xd800 && code <= 0xdfff ? 6 : escapedBytes(code);
    if (bytes + width > maxBytes) break;
    bytes += width;
    index += pair ? 2 : 1;
  }
  return index;
}

/**
 * The units from `start` that fit in `room` bytes, or the next part of the one at `start` when
 * it fits in none. `start` comes from a cursor, so it is checked against the units.
 */
export function pack(units: Unit[], start: Position, room: number): Packed {
  const unit = units[start.unit];
  if (!unit || (start.offset > 0 && start.offset >= unit.json.length)) throw invalidCursor("It points past the end");
  if (start.offset === 0) {
    let used = 0;
    let count = 0;
    while (start.unit + count < units.length && used + units[start.unit + count].bytes + 1 <= room) {
      used += units[start.unit + count].bytes + 1;
      count += 1;
    }
    if (count > 0) {
      const nextUnit = start.unit + count;
      return { first: start.unit, count, ...(nextUnit < units.length ? { next: { unit: nextUnit, offset: 0 } } : {}) };
    }
  }
  const to = partEnd(unit.json, start.offset, room);
  // Only a frame near the bound could leave no room; failing beats returning the same page forever.
  if (to === start.offset) throw resultTooLarge();
  const next = to < unit.json.length
    ? { unit: start.unit, offset: to }
    : start.unit + 1 < units.length ? { unit: start.unit + 1, offset: 0 } : undefined;
  const part = { unit: start.unit, from: start.offset, to, length: unit.json.length, text: unit.json.slice(start.offset, to) };
  return { first: start.unit, count: 0, part, ...(next ? { next } : {}) };
}

// What a page's frame leaves for its units. A unit costs its JSON and a separator; one merged
// into an object of the frame (a template's, run's or section's fields) costs no more than that.
export const unitRoom = (frame: JsonRecord) => MAX_RESULT_BYTES - byteSize(frame) - PAGE_RESERVE_BYTES;

// ---- Pages ----------------------------------------------------------------------------

/**
 * The template or run a read pages through: the key its results hold it under, the reference a
 * page that does not carry its fields names it by, and the id and version (a run's revision)
 * every cursor holds.
 */
export type Paged = { key: "template" | "run"; ref: JsonRecord; id: string; version: number };

/** A page's part and nextCursor. */
export function paging(paged: Paged, packed: Packed, scope: ReadScope, partOf: (unit: number) => JsonRecord): JsonRecord {
  const { part, next } = packed;
  const cursor: ReadCursor | undefined = next ? { t: paged.id, v: paged.version, ...scope, u: next.unit, o: next.offset } : undefined;
  return {
    ...(part ? { part: { ...partOf(part.unit), from: part.from, to: part.to, length: part.length, text: part.text } } : {}),
    ...(cursor ? { nextCursor: encodeCursor(cursor) } : {}),
  };
}

/**
 * An outline page: the fields (with the sections' count, task count and size, and `extra`),
 * then each section's id, title, task count and size, as many as fit.
 */
export function outlinePage(paged: Paged, header: JsonRecord, sections: JsonRecord[], start: Position, extra: JsonRecord = {}): JsonRecord {
  const sizes = sections.map(byteSize);
  const fields = {
    ...header,
    sectionCount: sections.length,
    taskCount: sections.reduce((total, section) => total + tasksOf(section).length, 0),
    // The sections as a whole result would hold them: an array of them.
    bytes: sizes.reduce((total, size) => total + size, 0) + Math.max(sections.length - 1, 0) + 2,
    ...extra,
  };
  const values: JsonRecord[] = [fields, ...sections.map((section, index) => ({
    id: section.id,
    title: typeof section.title === "string" ? boundedText(section.title) : null,
    taskCount: tasksOf(section).length,
    bytes: sizes[index],
  }))];
  const frame = { [paged.key]: paged.ref, sectionsOmitted: true, outline: [], limit: MAX_RESULT_BYTES };
  const packed = pack(values.map(unitOf), start, unitRoom(frame));
  const included = values.slice(packed.first, packed.first + packed.count);
  const withFields = packed.first === 0 && packed.count > 0;
  return bounded({
    [paged.key]: withFields ? included[0] : paged.ref,
    sectionsOmitted: true,
    outline: withFields ? included.slice(1) : included,
    limit: MAX_RESULT_BYTES,
    ...paging(paged, packed, { m: "outline" }, (unit) => (unit === 0 ? { of: paged.key } : { of: "outline", index: unit - 1 })),
  });
}

/** A page of a section too large for one result: its fields first, then whole tasks. */
export function sectionPage(paged: Paged, sections: JsonRecord[], sectionIndex: number, start: Position): JsonRecord {
  const section = sections[sectionIndex];
  const { items: _items, ...fields } = section;
  const tasks = tasksOf(section);
  const values: JsonRecord[] = [fields, ...tasks];
  const frame = { [paged.key]: paged.ref, section: { ...frameId("id", section.id), taskCount: tasks.length, firstTask: tasks.length, items: [] } };
  const packed = pack(values.map(unitOf), start, unitRoom(frame));
  const withFields = packed.first === 0 && packed.count > 0;
  return bounded({
    [paged.key]: paged.ref,
    section: {
      ...(withFields ? fields : frameId("id", section.id)),
      taskCount: tasks.length,
      // The section's tasks from here are in items; its fields are unit 0.
      firstTask: Math.max(packed.first - 1, 0),
      items: values.slice(Math.max(packed.first, 1), packed.first + packed.count),
    },
    ...paging(paged, packed, { m: "section", s: sectionIndex }, (unit) =>
      (unit === 0 ? { of: "section", index: sectionIndex } : { of: "task", index: unit - 1 })),
  });
}

/** A page of a task too large for one result: a part of its JSON text. */
export function taskPage(paged: Paged, sections: JsonRecord[], sectionIndex: number, taskIndex: number, start: Position): JsonRecord {
  const section = sections[sectionIndex];
  const task = tasksOf(section)[taskIndex];
  const frame = { [paged.key]: paged.ref, ...frameId("sectionId", section.id) };
  const packed = pack([unitOf(task)], start, unitRoom(frame));
  return bounded({
    ...frame,
    ...(packed.count > 0 ? { task } : {}),
    ...paging(paged, packed, { m: "task", s: sectionIndex, k: taskIndex }, () => ({ of: "task", index: taskIndex })),
  });
}

/** A read of one section or task: whole when it fits, otherwise its first page. */
export function readSectionOrTask(paged: Paged, sections: JsonRecord[], args: { sectionId?: string; taskId?: string }): JsonRecord {
  if (args.taskId !== undefined) {
    const { sectionIndex, taskIndex } = findTask(sections, args.taskId, args.sectionId);
    const section = sections[sectionIndex];
    const whole = { [paged.key]: paged.ref, sectionId: section.id, task: tasksOf(section)[taskIndex] };
    return fits(whole) ? whole : taskPage(paged, sections, sectionIndex, taskIndex, START);
  }
  const sectionIndex = findSection(sections, args.sectionId as string);
  const whole = { [paged.key]: paged.ref, section: sections[sectionIndex] };
  return fits(whole) ? whole : sectionPage(paged, sections, sectionIndex, START);
}

/**
 * The outline, section or task page a cursor continues, once the caller has checked that it
 * belongs to this version of this template or run. A sectionId or taskId passed with it must
 * name the section or task it reads.
 */
export function continuePage(
  paged: Paged,
  header: JsonRecord,
  sections: JsonRecord[],
  cursor: ReadCursor,
  args: { sectionId?: string; taskId?: string },
  outlineExtra: JsonRecord = {},
): JsonRecord {
  const section = cursor.m === "outline" || cursor.s === undefined ? undefined : sections[cursor.s];
  const task = section && cursor.m === "task" && cursor.k !== undefined ? tasksOf(section)[cursor.k] : undefined;
  if (cursor.m === "retired" || (cursor.m !== "outline" && !section) || (cursor.m === "task" && !task)) {
    throw invalidCursor("It points past the end");
  }
  if ((args.sectionId !== undefined && args.sectionId !== section?.id) || (args.taskId !== undefined && args.taskId !== task?.id)) {
    throw invalidCursor(`It continues another read; pass it with ${paged.key}Id alone`);
  }
  const start = { unit: cursor.u, offset: cursor.o };
  if (cursor.m === "outline") return outlinePage(paged, header, sections, start, outlineExtra);
  if (cursor.m === "section") return sectionPage(paged, sections, cursor.s as number, start);
  return taskPage(paged, sections, cursor.s as number, cursor.k as number, start);
}

/** The line a read's result starts its text with, for clients that show text. */
export function describePage(result: JsonRecord, tool: string, noun: "Template" | "Run"): string | null {
  const more = typeof result.nextCursor === "string" ? ` More follows: call ${tool} with cursor set to nextCursor.` : "";
  if (isRecord(result.part)) {
    const of = String(result.part.of);
    return `Loaded part of ${/^[aeiou]/.test(of) ? "an" : "a"} ${of} too large for one result; join its parts' text in order.${more}`;
  }
  if (result.sectionsOmitted === true) {
    const fields = isRecord(result[noun.toLowerCase()]) ? result[noun.toLowerCase()] as JsonRecord : {};
    const name = typeof fields.title === "string" ? `${noun} "${boundedText(fields.title)}"` : `This ${noun.toLowerCase()}`;
    return `${name} is too large to return at once, so this is its outline; read a section with sectionId.${more}`;
  }
  if (isRecord(result.task)) return `Loaded task "${boundedText(result.task.title)}".`;
  if (isRecord(result.section)) {
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
