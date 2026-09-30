import { z } from "zod";
import { sanitizeStoredSections } from "../../../src/lib/schemas/storedSections";
import { normalizeSectionsPayload, normalizeStringArray, parseJsonArray } from "../utils/payloads";
import { withStableTemplateIdentities } from "../utils/template-identities";
import { boundedText, toWellFormedText, utf8ByteLength } from "./agentMcpRuns";
import { MAX_TEMPLATE_RESULT_BYTES } from "./agentMcpTemplateTools";
import { isRecord, ToolError, type JsonRecord } from "./agentMcpTools";

// What the template tools return, each result within MAX_TEMPLATE_RESULT_BYTES. get_template
// returns a template whole when it fits. A larger one comes back as an outline of its
// sections, and sectionId or taskId reads one section or task. A section too large for one
// result comes back a page of tasks at a time, and anything too large for a result on its own
// (a template's fields, an outline entry, a section's fields, a task) as parts of its JSON
// text. A result with more to read has nextCursor, which holds the version it was read from.

export type TemplateView = { header: JsonRecord; sections: JsonRecord[] };

// Stored text can hold a lone surrogate half, which strict JSON parsers (Codex's serde_json)
// reject, so strings are measured and sliced as agentMcp.ts sends them: well formed.
const wellFormed = (_key: string, value: unknown) => (typeof value === "string" ? toWellFormedText(value) : value);
const toJson = (value: unknown) => JSON.stringify(value, wellFormed);
const byteSize = (value: unknown) => utf8ByteLength(toJson(value));
const fits = (result: JsonRecord) => byteSize(result) <= MAX_TEMPLATE_RESULT_BYTES;

// Room every page keeps for nextCursor and a part's offsets.
const PAGE_RESERVE_BYTES = 512;
// A page's frame leaves out a longer id (the page with that section or task carries it), so
// no id can push a frame past the bound. Ids the app makes are under 50 characters.
const MAX_FRAME_ID_BYTES = 1024;

/**
 * The sections an agent reads and sends back. Entries stored without ids get the ids a save
 * stores, as the web editor reads them, so run progress follows them through update_template;
 * text fields are always text, and every section has a list of tasks.
 */
export function templateSections(items: unknown): JsonRecord[] {
  const { sections } = normalizeSectionsPayload(parseJsonArray(items) ?? []);
  return sanitizeStoredSections(withStableTemplateIdentities(sections))
    .map((section) => (Array.isArray(section.items) ? section : { ...section, items: [] }));
}

export function templateView(row: JsonRecord): TemplateView {
  return {
    header: {
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
    },
    sections: templateSections(row.items),
  };
}

export const tasksOf = (section: JsonRecord): JsonRecord[] =>
  (Array.isArray(section.items) ? section.items.filter(isRecord) : []);

const wholeTemplate = ({ header, sections }: TemplateView): JsonRecord => ({ template: { ...header, sections } });

// Names the template on a page that does not carry its fields.
const templateRef = (header: JsonRecord): JsonRecord => ({
  id: header.id,
  version: header.version,
  contentVersion: header.contentVersion,
});

const frameId = (key: string, id: unknown): JsonRecord =>
  (typeof id === "string" && utf8ByteLength(id) <= MAX_FRAME_ID_BYTES ? { [key]: id } : {});

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

// ---- Cursors --------------------------------------------------------------------------

const cursorSchema = z.object({
  t: z.string(), // template id
  v: z.number().int().positive(), // the version the read started from
  m: z.enum(["outline", "section", "task"]),
  s: z.number().int().nonnegative().optional(), // section index
  k: z.number().int().nonnegative().optional(), // task index, in a task read
  u: z.number().int().nonnegative(), // the next unit to return
  o: z.number().int().nonnegative(), // how far into that unit's JSON text, in a part
}).strict();

type Cursor = z.infer<typeof cursorSchema>;
type Scope = Pick<Cursor, "m" | "s" | "k">;

function encodeCursor(cursor: Cursor): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(JSON.stringify(cursor))) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const invalidCursor = (message: string) =>
  new ToolError(`cursor: ${message}`, "invalid_arguments", { issues: [{ path: "cursor", message }] });

function decodeCursor(value: string): Cursor {
  try {
    const bytes = Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), (character) => character.charCodeAt(0));
    const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
    const parsed = cursorSchema.safeParse(JSON.parse(text));
    if (parsed.success) return parsed.data;
  } catch {
    // Reported below, like any other value get_template did not return.
  }
  throw invalidCursor("Not a cursor get_template returned");
}

// ---- Units and parts ------------------------------------------------------------------

// A page returns units (a template's fields, an outline entry, a section's fields, a task) in
// order, whole while they fit. One too large for a page on its own comes back in parts:
// consecutive slices of its JSON text.
type Unit = { json: string; bytes: number };
type Position = { unit: number; offset: number };
type Part = { unit: number; from: number; to: number; length: number; text: string };
type Packed = { first: number; count: number; part?: Part; next?: Position };

const START: Position = { unit: 0, offset: 0 };

const unitOf = (value: unknown): Unit => {
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
function pack(units: Unit[], start: Position, room: number): Packed {
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
  if (to === start.offset) throw new ToolError("Result is too large to return", "result_too_large", { limit: MAX_TEMPLATE_RESULT_BYTES });
  const next = to < unit.json.length
    ? { unit: start.unit, offset: to }
    : start.unit + 1 < units.length ? { unit: start.unit + 1, offset: 0 } : undefined;
  const part = { unit: start.unit, from: start.offset, to, length: unit.json.length, text: unit.json.slice(start.offset, to) };
  return { first: start.unit, count: 0, part, ...(next ? { next } : {}) };
}

// What a page's frame leaves for its units. A unit costs its JSON and a separator; one merged
// into an object of the frame (a template's or a section's fields) costs no more than that.
const unitRoom = (frame: JsonRecord) => MAX_TEMPLATE_RESULT_BYTES - byteSize(frame) - PAGE_RESERVE_BYTES;

// A page's part and nextCursor.
function paging(header: JsonRecord, packed: Packed, scope: Scope, partOf: (unit: number) => JsonRecord): JsonRecord {
  const { part, next } = packed;
  return {
    ...(part ? { part: { ...partOf(part.unit), from: part.from, to: part.to, length: part.length, text: part.text } } : {}),
    ...(next
      ? { nextCursor: encodeCursor({ t: String(header.id), v: Number(header.version), ...scope, u: next.unit, o: next.offset }) }
      : {}),
  };
}

// Every page is built to fit; checked again so that a mistake can only fail a read.
function bounded(page: JsonRecord): JsonRecord {
  if (fits(page)) return page;
  throw new ToolError("Result is too large to return", "result_too_large", { limit: MAX_TEMPLATE_RESULT_BYTES });
}

// ---- Pages ----------------------------------------------------------------------------

function outlinePage({ header, sections }: TemplateView, start: Position): JsonRecord {
  const sizes = sections.map(byteSize);
  const fields = {
    ...header,
    sectionCount: sections.length,
    taskCount: sections.reduce((total, section) => total + tasksOf(section).length, 0),
    // The sections as a whole template result would hold them: an array of them.
    bytes: sizes.reduce((total, size) => total + size, 0) + Math.max(sections.length - 1, 0) + 2,
  };
  const values: JsonRecord[] = [fields, ...sections.map((section, index) => ({
    id: section.id,
    title: typeof section.title === "string" ? boundedText(section.title) : null,
    taskCount: tasksOf(section).length,
    bytes: sizes[index],
  }))];
  const ref = templateRef(header);
  const frame = { template: ref, sectionsOmitted: true, outline: [], limit: MAX_TEMPLATE_RESULT_BYTES };
  const packed = pack(values.map(unitOf), start, unitRoom(frame));
  const included = values.slice(packed.first, packed.first + packed.count);
  const withFields = packed.first === 0 && packed.count > 0;
  return bounded({
    template: withFields ? included[0] : ref,
    sectionsOmitted: true,
    outline: withFields ? included.slice(1) : included,
    limit: MAX_TEMPLATE_RESULT_BYTES,
    ...paging(header, packed, { m: "outline" }, (unit) => (unit === 0 ? { of: "template" } : { of: "outline", index: unit - 1 })),
  });
}

function sectionPage({ header, sections }: TemplateView, sectionIndex: number, start: Position): JsonRecord {
  const section = sections[sectionIndex];
  const { items: _items, ...fields } = section;
  const tasks = tasksOf(section);
  const values: JsonRecord[] = [fields, ...tasks];
  const ref = templateRef(header);
  const frame = { template: ref, section: { ...frameId("id", section.id), taskCount: tasks.length, firstTask: tasks.length, items: [] } };
  const packed = pack(values.map(unitOf), start, unitRoom(frame));
  const withFields = packed.first === 0 && packed.count > 0;
  return bounded({
    template: ref,
    section: {
      ...(withFields ? fields : frameId("id", section.id)),
      taskCount: tasks.length,
      // The section's tasks from here are in items; its fields are unit 0.
      firstTask: Math.max(packed.first - 1, 0),
      items: values.slice(Math.max(packed.first, 1), packed.first + packed.count),
    },
    ...paging(header, packed, { m: "section", s: sectionIndex }, (unit) =>
      (unit === 0 ? { of: "section", index: sectionIndex } : { of: "task", index: unit - 1 })),
  });
}

function taskPage({ header, sections }: TemplateView, sectionIndex: number, taskIndex: number, start: Position): JsonRecord {
  const section = sections[sectionIndex];
  const task = tasksOf(section)[taskIndex];
  const frame = { template: templateRef(header), ...frameId("sectionId", section.id) };
  const packed = pack([unitOf(task)], start, unitRoom(frame));
  return bounded({
    ...frame,
    ...(packed.count > 0 ? { task } : {}),
    ...paging(header, packed, { m: "task", s: sectionIndex, k: taskIndex }, () => ({ of: "task", index: taskIndex })),
  });
}

// ---- Reads ----------------------------------------------------------------------------

// The page a cursor asks for, once it is known to belong to this version of this template
// and to the section or task the call names, if it names one.
function continueRead(view: TemplateView, value: string, args: { sectionId?: string; taskId?: string }): JsonRecord {
  const cursor = decodeCursor(value);
  const { header, sections } = view;
  if (cursor.t !== header.id) throw invalidCursor("It belongs to another template");
  if (cursor.v !== header.version) {
    throw new ToolError("Template changed since this read started; read it again without a cursor", "edit_conflict", {
      expectedVersion: cursor.v,
      currentVersion: header.version,
    });
  }
  const section = cursor.m === "outline" || cursor.s === undefined ? undefined : sections[cursor.s];
  const task = section && cursor.m === "task" && cursor.k !== undefined ? tasksOf(section)[cursor.k] : undefined;
  if ((cursor.m !== "outline" && !section) || (cursor.m === "task" && !task)) throw invalidCursor("It points past the end");
  if ((args.sectionId !== undefined && args.sectionId !== section?.id) || (args.taskId !== undefined && args.taskId !== task?.id)) {
    throw invalidCursor("It continues another read; pass it with templateId alone");
  }
  const start = { unit: cursor.u, offset: cursor.o };
  if (cursor.m === "outline") return outlinePage(view, start);
  if (cursor.m === "section") return sectionPage(view, cursor.s as number, start);
  return taskPage(view, cursor.s as number, cursor.k as number, start);
}

/** get_template's result (see the notes at the top). */
export function readTemplate(view: TemplateView, args: { sectionId?: string; taskId?: string; cursor?: string }): JsonRecord {
  if (args.cursor !== undefined) return continueRead(view, args.cursor, args);
  if (args.taskId !== undefined) {
    const { sectionIndex, taskIndex } = findTask(view.sections, args.taskId, args.sectionId);
    const section = view.sections[sectionIndex];
    const whole = { template: templateRef(view.header), sectionId: section.id, task: tasksOf(section)[taskIndex] };
    return fits(whole) ? whole : taskPage(view, sectionIndex, taskIndex, START);
  }
  if (args.sectionId !== undefined) {
    const sectionIndex = findSection(view.sections, args.sectionId);
    const whole = { template: templateRef(view.header), section: view.sections[sectionIndex] };
    return fits(whole) ? whole : sectionPage(view, sectionIndex, START);
  }
  const whole = wholeTemplate(view);
  return fits(whole) ? whole : outlinePage(view, START);
}

/** The line get_template's result starts its text with, for clients that show text. */
export function describeTemplateRead(result: JsonRecord): string {
  const template = isRecord(result.template) ? result.template : {};
  const more = typeof result.nextCursor === "string" ? " More follows: call get_template with cursor set to nextCursor." : "";
  if (isRecord(result.part)) {
    return `Loaded part of a ${String(result.part.of)} too large for one result; join its parts' text in order.${more}`;
  }
  if (result.sectionsOmitted === true) {
    const name = typeof template.title === "string" ? `Template "${boundedText(template.title)}"` : "This template";
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
  return `Loaded template "${boundedText(template.title)}".`;
}

function locateTask(sections: JsonRecord[], taskId: string | undefined) {
  if (taskId === undefined) return undefined;
  try {
    return findTask(sections, taskId);
  } catch {
    return undefined;
  }
}

/**
 * A template write's result: the template whole when it fits in one result, otherwise its
 * fields with sectionsOmitted and, when the write changed one section or task, that section or
 * task if it fits. The write has already committed, so this never fails: it leaves out what
 * does not fit, down to the template's id, title, and version.
 */
export function writtenTemplateResult(view: TemplateView, changed: { sectionId?: string; taskId?: string } = {}): JsonRecord {
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
