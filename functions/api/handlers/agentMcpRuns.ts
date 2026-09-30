import {
  contentSaveBytes,
  RUN_CONTENT_MAX_BYTES,
  RUN_CONTENT_TOO_LARGE_MESSAGE,
} from "../../../src/lib/schemas/contentLimits";
import { getTaskSubTasks, isSubTasksBlock, sanitizeStoredSections } from "../../../src/lib/schemas/storedSections";
import { contentFits } from "../utils/content-limits";
import { normalizeSectionsPayload, parseJsonArray } from "../utils/payloads";
import { findRunCompletionRefusal } from "../utils/run-completion";
import { isRecord, ToolError, type JsonRecord, type UpdateRunArgs } from "./agentMcpTools";

// Run content helpers for the personal run MCP endpoint: parsing, the view an agent reads, the
// operations update_run applies, and the content limit its writes keep. What the run tools return
// is in agentMcpRunPages.ts.

export function parseStoredSections(value: unknown): JsonRecord[] {
  const normalized = normalizeSectionsPayload(parseJsonArray(value) ?? []);
  return sanitizeStoredSections(normalized.sections);
}

/** Work a Template change removed from the run, with its completion and notes. */
export function parseRetiredItems(run: JsonRecord): JsonRecord[] {
  return (parseJsonArray(run.retired_items) ?? []).filter(isRecord);
}

// A task as an agent reads it: sub-items only inside Sub-tasks blocks, the ones the run page
// shows and update_run can tick (getTaskSubTasks). Sub-items stored on the task itself (older
// rows) or, in retired work, on another block are left out; the stored run keeps them.
const withoutSubItems = ({ subItems: _notSubTasks, ...rest }: JsonRecord): JsonRecord => rest;

export function agentTaskView(task: JsonRecord): JsonRecord {
  const view = withoutSubItems(task);
  if (Array.isArray(task.contents)) {
    view.contents = task.contents.map((content: unknown) =>
      isRecord(content) && !isSubTasksBlock(content) ? withoutSubItems(content) : content);
  }
  return view;
}

/** A section as an agent reads it: its tasks as agentTaskView shows them, and always a list of them. */
export function agentSectionView(section: JsonRecord): JsonRecord {
  if (!Array.isArray(section.items)) return { ...section, items: [] };
  return { ...section, items: section.items.map((task) => (isRecord(task) ? agentTaskView(task) : task)) };
}

export function agentRetiredView(entry: JsonRecord): JsonRecord {
  if (entry.kind === "section" && isRecord(entry.section)) return { ...entry, section: agentSectionView(entry.section) };
  if (entry.kind === "item" && isRecord(entry.item)) return { ...entry, item: agentTaskView(entry.item) };
  return entry;
}

/** A run's fields, without its sections and retired work. */
export function summarizeRun(run: JsonRecord): JsonRecord {
  return {
    id: run.id,
    templateId: run.template_id,
    title: run.title,
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

/**
 * Refuses run content that no write path may store (the web app's limit, checked by contentFits
 * in functions/api/utils/content-limits.ts). Call it before db.batch so an oversized write never
 * commits. Content no larger than `current`, the content it replaces, is allowed, so the owner of
 * a run stored over the limit can still shorten or clear its notes. update_run checks only
 * set_task_notes: the limit counts every task and Sub-task as unticked, so completion toggles
 * and status changes never change the size.
 */
export function assertRunContentFits(sections: unknown, current?: unknown): void {
  if (contentFits("run", sections, current)) return;
  throw new ToolError(RUN_CONTENT_TOO_LARGE_MESSAGE, "content_too_large", {
    limit: RUN_CONTENT_MAX_BYTES,
    size: contentSaveBytes(sections),
  });
}

const MAX_REPORTED_OPEN_TASKS = 20;

/**
 * Refuses to complete a run that has no tasks or still has an open task or Sub-task, the rule
 * the run page follows: it freezes a completed run, so it could never finish the open work.
 * Call it only for a run becoming completed; re-sending completed for one already completed
 * (even an older one with open work) stays a no-op.
 */
export function assertRunCanBeCompleted(sections: JsonRecord[]): void {
  const refusal = findRunCompletionRefusal(sections);
  if (!refusal) return;
  const open = refusal.openTaskIds;
  throw new ToolError(refusal.message, "run_incomplete", {
    openTaskCount: open.length,
    openTaskIds: open.slice(0, MAX_REPORTED_OPEN_TASKS),
  });
}

function sectionTasks(section: JsonRecord): JsonRecord[] {
  return Array.isArray(section.items) ? section.items.filter(isRecord) : [];
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

  // The Sub-tasks the run page shows and counts, so a task an agent finishes reads as done there.
  const subtasks = getTaskSubTasks(task);
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
 * The retired work of one section and/or task, in the order the run holds it: entries retired
 * from the section (or the retired section itself), then of those, the ones for the task (a
 * retired section narrowed to that task). Without a scope, every entry.
 */
export function retiredWorkOf(entries: JsonRecord[], scope: { sectionId?: string; taskId?: string }): JsonRecord[] {
  const inSection = scope.sectionId === undefined
    ? entries
    : entries.filter((entry) => retiredSectionId(entry) === scope.sectionId);
  return scope.taskId === undefined ? inSection : retiredEntriesForTask(inSection, scope.taskId);
}
