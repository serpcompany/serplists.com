import {
  contentSaveBytes,
  RUN_CONTENT_MAX_BYTES,
  RUN_CONTENT_TOO_LARGE_MESSAGE,
} from "../../../src/lib/schemas/contentLimits";
import { getTaskSubTasks, isSubTasksBlock, sanitizeStoredSections } from "../../../src/lib/schemas/storedSections";
import { contentFits } from "../utils/content-limits";
import { normalizeSectionsPayload, parseJsonArray } from "../utils/payloads";
import { findRunCompletionRefusal } from "../utils/run-completion";
import { isRecord, ToolError, type JsonRecord, type SectionAndTaskIds, type UpdateRunArgs } from "./agentMcpTools";

export function parseStoredSections(value: unknown): JsonRecord[] {
  const normalized = normalizeSectionsPayload(parseJsonArray(value) ?? []);
  return sanitizeStoredSections(normalized.sections);
}

export function parseRetiredItems(run: JsonRecord): JsonRecord[] {
  return (parseJsonArray(run.retired_items) ?? []).filter(isRecord);
}

const withoutSubItems = ({ subItems: _notSubTasks, ...rest }: JsonRecord): JsonRecord => rest;

export function agentTaskView(task: JsonRecord): JsonRecord {
  const view = withoutSubItems(task);
  if (Array.isArray(task.contents)) {
    view.contents = task.contents.map((content: unknown) =>
      isRecord(content) && !isSubTasksBlock(content) ? withoutSubItems(content) : content);
  }
  return view;
}

export function agentSectionView(section: JsonRecord): JsonRecord {
  if (!Array.isArray(section.items)) return { ...section, items: [] };
  return { ...section, items: section.items.map((task: unknown) => (isRecord(task) ? agentTaskView(task) : task)) };
}

export function agentRetiredView(entry: JsonRecord): JsonRecord {
  if (entry.kind === "section" && isRecord(entry.section)) return { ...entry, section: agentSectionView(entry.section) };
  if (entry.kind === "item" && isRecord(entry.item)) return { ...entry, item: agentTaskView(entry.item) };
  return entry;
}

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

export function assertRunContentFits(sections: unknown, contentItReplaces?: unknown): void {
  if (contentFits("run", sections, contentItReplaces)) return;
  throw new ToolError(RUN_CONTENT_TOO_LARGE_MESSAGE, "content_too_large", {
    limit: RUN_CONTENT_MAX_BYTES,
    size: contentSaveBytes(sections),
  });
}

const MAX_REPORTED_OPEN_TASKS = 20;

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

export function updateRunAuditDiff(args: UpdateRunArgs, existing: JsonRecord, updates: JsonRecord): JsonRecord {
  const { runId: _runId, expectedRevision: _expectedRevision, ...change } = args;
  const diff: JsonRecord = {
    ...change,
    progress: { from: typeof existing.progress === "number" ? existing.progress : 0, to: updates.progress },
    revision: { from: typeof existing.revision === "number" ? existing.revision : 1, to: updates.revision },
  };
  if (change.operation === "set_task_notes") {
    delete diff.notes;
    diff.notesLength = change.notes.length;
  }
  if (updates.completed_at !== undefined) diff.completedAt = updates.completed_at;
  return diff;
}

function retiredRecord(entry: JsonRecord): JsonRecord | null {
  const record = entry.kind === "section" ? entry.section : entry.kind === "item" ? entry.item : entry.subItem;
  return isRecord(record) ? record : null;
}

function retiredSectionId(entry: JsonRecord): unknown {
  return entry.kind === "section" ? retiredRecord(entry)?.id : entry.sectionId;
}

function retiredEntriesForTask(entries: JsonRecord[], taskId: string): JsonRecord[] {
  return entries.flatMap((entry) => {
    if (entry.kind === "item") return retiredRecord(entry)?.id === taskId ? [entry] : [];
    if (entry.kind === "subItem") return entry.itemId === taskId ? [entry] : [];
    const section = entry.kind === "section" ? retiredRecord(entry) : null;
    const task = section ? sectionTasks(section).find((item) => item.id === taskId) : undefined;
    return section && task ? [{ ...entry, section: { ...section, items: [task] } }] : [];
  });
}

export function retiredWorkOf(entries: JsonRecord[], scope: SectionAndTaskIds): JsonRecord[] {
  const inSection = scope.sectionId === undefined
    ? entries
    : entries.filter((entry) => retiredSectionId(entry) === scope.sectionId);
  return scope.taskId === undefined ? inSection : retiredEntriesForTask(inSection, scope.taskId);
}
