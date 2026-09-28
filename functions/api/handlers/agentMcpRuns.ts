import { sanitizeStoredSections } from "../../../src/lib/schemas/storedSections";
import { normalizeSectionsPayload, parseJsonArray } from "../utils/payloads";
import { isRecord, ToolError, type JsonRecord, type UpdateRunArgs } from "./agentMcpTools";

// Run content helpers for the personal run MCP endpoint: parsing, serialization, the
// operations update_run applies, and the size bounds that keep every result returnable.

export const MAX_RESULT_BYTES = 512 * 1024;
// Largest run content (the sections JSON stored in checklist_runs.items) an MCP write may
// produce. It stays well under MAX_RESULT_BYTES so get_run can always return a run MCP
// wrote, and it keeps the run row far below D1's 2 MB row limit.
export const MAX_RUN_CONTENT_BYTES = 384 * 1024;
// The section/task outline that result_too_large returns must itself stay small.
const MAX_OUTLINE_BYTES = MAX_RESULT_BYTES / 2;
const MAX_OUTLINE_SECTIONS = 1_000;
// The retired-work outline beside it, so both together stay under MAX_RESULT_BYTES.
const MAX_RETIRED_OUTLINE_BYTES = MAX_OUTLINE_BYTES / 2;

export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

export function jsonByteLength(value: unknown): number {
  return utf8ByteLength(JSON.stringify(value));
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

export function parseStoredSections(value: unknown): JsonRecord[] {
  const normalized = normalizeSectionsPayload(parseJsonArray(value) ?? []);
  return sanitizeStoredSections(normalized.sections);
}

/** Work a Template change removed from the run, with its completion and notes. */
export function parseRetiredItems(run: JsonRecord): JsonRecord[] {
  return (parseJsonArray(run.retired_items) ?? []).filter(isRecord);
}

export function serializeRun(
  run: JsonRecord,
  sections: JsonRecord[] = parseStoredSections(run.items),
  retiredItems: JsonRecord[] = parseRetiredItems(run),
): JsonRecord {
  return {
    id: run.id,
    templateId: run.template_id,
    title: run.title,
    sections,
    retiredItems,
    status: run.status ?? "in_progress",
    progress: typeof run.progress === "number" ? run.progress : 0,
    revision: typeof run.revision === "number" ? run.revision : 1,
    templateVersion: typeof run.template_version === "number" ? run.template_version : 1,
    startedAt: run.started_at,
    completedAt: run.completed_at,
    createdAt: run.created_at,
    updatedAt: run.updated_at,
  };
}

export function summarizeRun(run: JsonRecord): JsonRecord {
  const serialized = serializeRun(run, [], []);
  delete serialized.sections;
  delete serialized.retiredItems;
  return serialized;
}

/**
 * Rejects a write whose run content would exceed MAX_RUN_CONTENT_BYTES. Call it before
 * db.batch so an oversized write never commits. A write that keeps or shrinks a run
 * already over the cap (a run created on the web) is allowed, so its owner can still
 * shorten or clear notes through MCP. update_run checks only set_task_notes: completion
 * toggles and status changes never grow content materially, so they always go through.
 */
export function assertRunContentFits(nextBytes: number, currentBytes = 0): void {
  if (nextBytes <= MAX_RUN_CONTENT_BYTES || nextBytes <= currentBytes) return;
  throw new ToolError("Run content is too large for MCP; shorten notes or the template", "content_too_large", {
    limit: MAX_RUN_CONTENT_BYTES,
    size: nextBytes,
  });
}

function sectionTasks(section: JsonRecord): JsonRecord[] {
  return Array.isArray(section.items) ? section.items.filter(isRecord) : [];
}

function getSubtasks(task: JsonRecord): JsonRecord[] {
  const direct = Array.isArray(task.subItems) ? task.subItems.filter(isRecord) : [];
  const nested = Array.isArray(task.contents)
    ? task.contents.filter(isRecord).flatMap((content) =>
        Array.isArray(content.subItems) ? content.subItems.filter(isRecord) : [])
    : [];
  return [...direct, ...nested];
}

function findTask(sections: JsonRecord[], taskId: string): JsonRecord | null {
  for (const section of sections) {
    const task = sectionTasks(section).find((item) => item.id === taskId);
    if (task) return task;
  }
  return null;
}

export function applyRunOperation(sections: JsonRecord[], operation: UpdateRunArgs): void {
  if (operation.operation === "set_run_status") return;

  const task = findTask(sections, operation.taskId);
  if (!task) throw new ToolError("Task not found", "task_not_found");

  if (operation.operation === "set_task_notes") {
    task.notes = operation.notes;
    return;
  }

  const subtasks = getSubtasks(task);
  if (operation.operation === "set_task_completed") {
    task.isCompleted = operation.completed;
    for (const subtask of subtasks) subtask.isCompleted = operation.completed;
    return;
  }

  const subtask = subtasks.find((candidate) => candidate.id === operation.subtaskId);
  if (!subtask) throw new ToolError("Subtask not found", "subtask_not_found");
  subtask.isCompleted = operation.completed;
  task.isCompleted = subtasks.length > 0 && subtasks.every((candidate) => candidate.isCompleted === true);
}

/**
 * The update_run result: the run summary (with its new revision) and the changed task.
 * It runs after the write has committed, so it must never fail: a task too large to
 * return is left out rather than turning the committed write into an error.
 */
export function updateRunResult(nextRun: JsonRecord, sections: JsonRecord[], operation: UpdateRunArgs): JsonRecord {
  const run = summarizeRun(nextRun);
  if (operation.operation === "set_run_status") return { run };
  const result = { run, task: findTask(sections, operation.taskId) };
  return jsonByteLength(result) <= MAX_RESULT_BYTES ? result : { run, taskOmitted: true };
}

// Scalar run fields recorded in audit payloads. Content (items, retired_items) is left
// out: an agent changes one field per call, and a full copy per call multiplies storage
// and the run history response. The share token is a secret.
const AUDITED_RUN_FIELDS = [
  "id",
  "user_id",
  "team_id",
  "template_id",
  "template_version",
  "title",
  "status",
  "progress",
  "revision",
  "started_at",
  "completed_at",
  "completed_by_user_id",
  "updated_at",
  "deleted_at",
] as const;

export function summarizeRunForAudit(run: JsonRecord): JsonRecord {
  return Object.fromEntries(AUDITED_RUN_FIELDS.filter((field) => field in run).map((field) => [field, run[field]]));
}

/** The audit diff for one update_run call: the operation and what it changed. */
export function updateRunAuditDiff(args: UpdateRunArgs, existing: JsonRecord, updates: JsonRecord): JsonRecord {
  const { runId: _runId, expectedRevision: _expectedRevision, ...change } = args;
  const diff: JsonRecord = {
    ...change,
    progress: { from: typeof existing.progress === "number" ? existing.progress : 0, to: updates.progress },
    revision: { from: typeof existing.revision === "number" ? existing.revision : 1, to: updates.revision },
  };
  if (change.operation === "set_task_notes") {
    // Notes can be 20,000 characters of user content; the run row holds them.
    delete diff.notes;
    diff.notesLength = change.notes.length;
  }
  if (updates.completed_at !== undefined) diff.completedAt = updates.completed_at;
  return diff;
}

// The section, task or Sub-task record a retired entry holds; null for a malformed entry.
function retiredRecord(entry: JsonRecord): JsonRecord | null {
  const record = entry.kind === "section" ? entry.section : entry.kind === "item" ? entry.item : entry.subItem;
  return isRecord(record) ? record : null;
}

// The section a retired entry belongs to: its own id for a retired section.
function retiredSectionId(entry: JsonRecord): unknown {
  return entry.kind === "section" ? retiredRecord(entry)?.id : entry.sectionId;
}

// The retired entries for one task: the task itself, its Sub-tasks, or a retired section
// narrowed to that task. Ids can repeat in older data, so every match is kept.
function retiredEntriesForTask(entries: JsonRecord[], taskId: string): JsonRecord[] {
  return entries.flatMap((entry) => {
    if (entry.kind === "item") return retiredRecord(entry)?.id === taskId ? [entry] : [];
    if (entry.kind === "subItem") return entry.itemId === taskId ? [entry] : [];
    const section = entry.kind === "section" ? retiredRecord(entry) : null;
    const task = section ? sectionTasks(section).find((item) => item.id === taskId) : undefined;
    return section && task ? [{ ...entry, section: { ...section, items: [task] } }] : [];
  });
}

/**
 * Narrows a run to one section and/or one task for get_run, live or retired. The retired
 * entries follow the same scope, so a run whose retired work is large can still be read
 * in parts; an id that only retired work holds returns no live sections.
 */
export function selectRunScope(
  sections: JsonRecord[],
  retiredItems: JsonRecord[],
  scope: { sectionId?: string; taskId?: string },
): { sections: JsonRecord[]; retiredItems: JsonRecord[] } {
  let scoped = sections;
  let retired = retiredItems;
  if (scope.sectionId) {
    scoped = sections.filter((section) => section.id === scope.sectionId);
    retired = retiredItems.filter((entry) => retiredSectionId(entry) === scope.sectionId);
    if (scoped.length === 0 && retired.length === 0) throw new ToolError("Section not found", "section_not_found");
  }
  const { taskId } = scope;
  if (!taskId) return { sections: scoped, retiredItems: retired };

  const liveSection = scoped.find((section) => sectionTasks(section).some((item) => item.id === taskId));
  const liveTask = liveSection ? sectionTasks(liveSection).find((item) => item.id === taskId) : undefined;
  const liveSections = liveSection && liveTask ? [{ ...liveSection, items: [liveTask] }] : [];
  const retiredForTask = retiredEntriesForTask(retired, taskId);
  if (liveSections.length === 0 && retiredForTask.length === 0) throw new ToolError("Task not found", "task_not_found");
  return { sections: liveSections, retiredItems: retiredForTask };
}

/** Section and task ids an agent can pass back to get_run to read a large run in parts. */
export function outlineSections(sections: JsonRecord[]): JsonRecord[] {
  const withTasks = sections.map((section) => ({
    id: section.id,
    title: boundedText(section.title),
    tasks: sectionTasks(section).map((task) => ({ id: task.id, title: boundedText(task.title) })),
  }));
  if (jsonByteLength(withTasks) <= MAX_OUTLINE_BYTES) return withTasks;
  return sections.slice(0, MAX_OUTLINE_SECTIONS).map((section) => ({
    id: section.id,
    title: boundedText(section.title),
    taskCount: sectionTasks(section).length,
  }));
}

/**
 * Retired entries by kind, id and title (never notes), with the ids get_run takes to read
 * them: a retired section's id and task ids, a retired task's id, a Sub-task's itemId.
 */
export function outlineRetiredItems(entries: JsonRecord[]): JsonRecord[] {
  const outline = (entry: JsonRecord, withTasks: boolean): JsonRecord => {
    const record = retiredRecord(entry);
    const base = { kind: entry.kind, id: record?.id, title: boundedText(record?.title) };
    if (entry.kind === "section") {
      const tasks = record ? sectionTasks(record) : [];
      return withTasks
        ? { ...base, tasks: tasks.map((task) => ({ id: task.id, title: boundedText(task.title) })) }
        : { ...base, taskCount: tasks.length };
    }
    if (entry.kind === "subItem") return { ...base, sectionId: entry.sectionId, itemId: entry.itemId };
    return { ...base, sectionId: entry.sectionId };
  };
  const withTasks = entries.map((entry) => outline(entry, true));
  if (jsonByteLength(withTasks) <= MAX_RETIRED_OUTLINE_BYTES) return withTasks;
  // Too many to list in full: leave out task lists (a retired section's own read lists
  // them) and stop at the byte budget.
  const compact: JsonRecord[] = [];
  let bytes = 2;
  for (const entry of entries) {
    const line = outline(entry, false);
    bytes += jsonByteLength(line) + 1;
    if (bytes > MAX_RETIRED_OUTLINE_BYTES) break;
    compact.push(line);
  }
  return compact;
}
