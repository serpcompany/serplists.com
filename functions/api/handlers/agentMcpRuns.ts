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

export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

export function jsonByteLength(value: unknown): number {
  return utf8ByteLength(JSON.stringify(value));
}

export function boundedText(value: unknown, maximum = 160): string {
  const text = typeof value === "string" ? value : "Untitled";
  return text.length <= maximum ? text : `${text.slice(0, maximum - 1)}…`;
}

export function parseStoredSections(value: unknown): JsonRecord[] {
  const normalized = normalizeSectionsPayload(parseJsonArray(value) ?? []);
  return normalized.sections.filter(isRecord);
}

export function resetCompletionState(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(resetCompletionState);
  if (!isRecord(value)) return value;

  const next: JsonRecord = { ...value };
  if (Object.prototype.hasOwnProperty.call(next, "isCompleted")) next.isCompleted = false;
  if (Array.isArray(next.items)) next.items = next.items.map(resetCompletionState);
  if (Array.isArray(next.subItems)) next.subItems = next.subItems.map(resetCompletionState);
  if (Array.isArray(next.contents)) next.contents = next.contents.map(resetCompletionState);
  return next;
}

export function serializeRun(run: JsonRecord, sections: JsonRecord[] = parseStoredSections(run.items)): JsonRecord {
  return {
    id: run.id,
    templateId: run.template_id,
    title: run.title,
    sections,
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
  const serialized = serializeRun(run, []);
  delete serialized.sections;
  return serialized;
}

/**
 * Rejects a write whose run content would exceed MAX_RUN_CONTENT_BYTES. Call it before
 * db.batch so an oversized write never commits. A write that keeps or shrinks a run
 * already over the cap (a run created on the web) is allowed, so its owner can still
 * clear notes, complete tasks, or finish it through MCP.
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

/** Narrows a run's sections to one section and/or one task for get_run. */
export function selectRunSections(
  sections: JsonRecord[],
  scope: { sectionId?: string; taskId?: string },
): JsonRecord[] {
  let scoped = sections;
  if (scope.sectionId) {
    scoped = sections.filter((section) => section.id === scope.sectionId);
    if (scoped.length === 0) throw new ToolError("Section not found", "section_not_found");
  }
  if (!scope.taskId) return scoped;

  for (const section of scoped) {
    const task = sectionTasks(section).find((item) => item.id === scope.taskId);
    if (task) return [{ ...section, items: [task] }];
  }
  throw new ToolError("Task not found", "task_not_found");
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
