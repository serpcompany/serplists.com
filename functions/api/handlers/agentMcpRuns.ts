import type { schema } from "../db";
import {
  contentSaveBytes,
  RUN_CONTENT_MAX_BYTES,
  RUN_CONTENT_TOO_LARGE_MESSAGE,
} from "../../../src/lib/schemas/contentLimits";
import {
  isChecklistNodeRecord,
  isContentRecord,
  isRecord,
  isSectionRecord,
  isTaskRecord,
  readTextId,
  taskRecordsIn,
  type ChecklistNodeRecord,
  type ContentRecord,
  type FormFieldRecord,
  type JsonRecord,
  type SectionRecord,
  type TaskRecord,
} from "../../../src/lib/schemas/jsonRecords";
import {
  getTaskFormFields,
  getTaskSubTasks,
  isFormBlock,
  isSubTasksBlock,
  sanitizeStoredSections,
} from "../../../src/lib/schemas/storedSections";
import type { RunUpdates } from "../utils/checklist-runs";
import { contentFits } from "../utils/content-limits";
import { normalizeSectionsPayload } from "../utils/payloads";
import { parseJsonArray } from "../../../src/lib/schemas/jsonArrays";
import { findRunCompletionRefusal } from "../utils/run-completion";
import {
  doneTaskFormBlockers,
  FORM_INCOMPLETE_MESSAGE,
  formIncompleteDetails,
  taskFormBlockers,
} from "../utils/run-form-guard";
import {
  FORM_FIELD_KIND_LABELS,
  fitsFormAnswerShape,
  isFormFieldKind,
  readFormFields,
  type FormFieldKind,
} from "../../../src/lib/schemas/formFields";
import {
  FORM_INCOMPLETE_CODE,
  findFormFieldProblem,
  formFieldProblemMessage,
  isFormAnswerEmpty,
} from "../../../src/lib/schemas/formValidation";
import { boundedText } from "./agentMcpPages";
import { ToolError, type SectionAndTaskIds, type SetFormAnswerArgs, type UpdateRunArgs } from "./agentMcpTools";

type RunRow = typeof schema.checklistRuns.$inferSelect;

export type RunSummaryFields = Partial<Pick<
  RunRow,
  | "id"
  | "template_id"
  | "title"
  | "status"
  | "progress"
  | "revision"
  | "template_version"
  | "started_at"
  | "completed_at"
  | "created_at"
  | "updated_at"
>>;

export interface RetiredEntryRecord extends JsonRecord {
  kind?: unknown;
  section?: unknown;
  item?: unknown;
  subItem?: unknown;
  field?: unknown;
  sectionId?: unknown;
  itemId?: unknown;
}

const isRetiredEntryRecord: (value: unknown) => value is RetiredEntryRecord = isRecord;

export function parseStoredSections(value: unknown): SectionRecord[] {
  const normalized = normalizeSectionsPayload(parseJsonArray(value) ?? []);
  return sanitizeStoredSections(normalized.sections);
}

export function parseRetiredItems(run: Partial<Pick<RunRow, "retired_items">>): RetiredEntryRecord[] {
  return (parseJsonArray(run.retired_items) ?? []).filter(isRetiredEntryRecord);
}

const withoutSubItems = ({ subItems: _notSubTasks, ...rest }: TaskRecord): JsonRecord => rest;

function agentContentView(content: ContentRecord): JsonRecord {
  const { subItems, fields, ...rest } = content;
  return {
    ...rest,
    ...(isSubTasksBlock(content) && subItems !== undefined ? { subItems } : {}),
    ...(isFormBlock(content) && fields !== undefined ? { fields } : {}),
  };
}

export function agentTaskView(task: TaskRecord): TaskRecord {
  const view: TaskRecord = withoutSubItems(task);
  if (Array.isArray(task.contents)) {
    view.contents = task.contents.map((content: unknown) => (isContentRecord(content) ? agentContentView(content) : content));
  }
  return view;
}

export function agentSectionView(section: SectionRecord): SectionRecord {
  if (!Array.isArray(section.items)) return { ...section, items: [] };
  return { ...section, items: section.items.map((task: unknown) => (isTaskRecord(task) ? agentTaskView(task) : task)) };
}

export function agentRetiredView(entry: RetiredEntryRecord): RetiredEntryRecord {
  if (entry.kind === "section" && isSectionRecord(entry.section)) return { ...entry, section: agentSectionView(entry.section) };
  if (entry.kind === "item" && isTaskRecord(entry.item)) return { ...entry, item: agentTaskView(entry.item) };
  return entry;
}

export type RunFields = RunSummaryFields & Partial<Pick<RunRow, "items" | "retired_items">>;

export function summarizeRun(run: RunSummaryFields) {
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

export function assertRunCanBeCompleted(sections: SectionRecord[]): void {
  const refusal = findRunCompletionRefusal(sections);
  if (!refusal) return;
  const open = refusal.openTaskIds;
  throw new ToolError(refusal.message, "run_incomplete", {
    openTaskCount: open.length,
    openTaskIds: open.slice(0, MAX_REPORTED_OPEN_TASKS),
  });
}

function findTask(sections: SectionRecord[], taskId: string): TaskRecord | null {
  for (const section of sections) {
    const task = taskRecordsIn(section.items).find((item) => item.id === taskId);
    if (task) return task;
  }
  return null;
}

const FROZEN_ON_A_COMPLETED_RUN = new Set<UpdateRunArgs["operation"]>(["set_task_completed", "set_subtask_completed", "set_form_answer"]);

export function assertRunTasksCanChange(run: Pick<RunRow, "status">, operation: UpdateRunArgs): void {
  if (run.status !== "completed" || !FROZEN_ON_A_COMPLETED_RUN.has(operation.operation)) return;
  throw new ToolError(
    "Run is completed, so its tasks, subtasks, and form answers can no longer be changed; set_run_status in_progress reopens it",
    "run_completed",
  );
}

const ANSWER_TYPES: Record<Exclude<FormFieldKind, "file">, string> = {
  text: "a string",
  longText: "a string",
  url: "a string",
  email: "a string",
  number: "a number",
  date: "a YYYY-MM-DD string",
  select: "an option id",
  multiSelect: "an array of option ids",
  checkbox: "true or false",
};

const DONE_TASK_FORM_INCOMPLETE_MESSAGE = "The task is done, and this answer would leave its form with a required field "
  + "without an answer or an answer that is not valid; untick it with set_task_completed first";

function findFormField(task: TaskRecord, fieldId: string): { field: FormFieldRecord; kind: FormFieldKind } {
  const field = getTaskFormFields(task).find((candidate) => readTextId(candidate.id) === fieldId);
  const kind = field?.kind;
  if (!field || !isFormFieldKind(kind)) {
    throw new ToolError(`Form field not found: the task's form has no field "${boundedText(fieldId)}" (fieldId)`, "field_not_found");
  }
  return { field, kind };
}

function answerToStore(field: FormFieldRecord, kind: FormFieldKind, operation: SetFormAnswerArgs): unknown {
  const { answer, taskId, fieldId } = operation;
  const details = { taskId, fieldId, kind };
  if (answer === null) return undefined;
  if (kind === "file") {
    throw new ToolError("A file field can only be cleared over MCP (answer null); upload the file in SERP Lists", "unsupported_field_kind", details);
  }
  if (!fitsFormAnswerShape(kind, answer)) {
    throw new ToolError(`A ${FORM_FIELD_KIND_LABELS[kind]} field takes ${ANSWER_TYPES[kind]}, or null to clear it`, "invalid_answer", details);
  }
  if (isFormAnswerEmpty(answer)) return undefined;
  const value = Array.isArray(answer) ? [...new Set(answer)] : answer;
  const answered = { ...field, answer: value };
  if (findFormFieldProblem(answered) === "invalid") {
    const [checked] = readFormFields([answered], () => fieldId);
    const message = checked ? formFieldProblemMessage(checked, "invalid") : "The answer is not valid";
    throw new ToolError(message, "invalid_answer", { ...details, reason: "invalid" });
  }
  return value;
}

function setFormAnswer(task: TaskRecord, operation: SetFormAnswerArgs): boolean {
  const { field, kind } = findFormField(task, operation.fieldId);
  const next = answerToStore(field, kind, operation);
  const before = JSON.stringify(field.answer ?? null);
  if (next === undefined) delete field.answer;
  else field.answer = next;
  const blocked = doneTaskFormBlockers(task);
  if (blocked.length > 0) throw new ToolError(DONE_TASK_FORM_INCOMPLETE_MESSAGE, FORM_INCOMPLETE_CODE, formIncompleteDetails(blocked));
  return JSON.stringify(field.answer ?? null) !== before;
}

export type RunOperationOutcome = { answerChanged: boolean };

export function applyRunOperation(sections: SectionRecord[], operation: UpdateRunArgs): RunOperationOutcome {
  const answersUnchanged = { answerChanged: false };
  if (operation.operation === "set_run_status") return answersUnchanged;

  const task = findTask(sections, operation.taskId);
  if (!task) throw new ToolError("Task not found", "task_not_found");

  if (operation.operation === "set_form_answer") return { answerChanged: setFormAnswer(task, operation) };

  if (operation.operation === "set_task_notes") {
    task.notes = operation.notes;
    return answersUnchanged;
  }

  const subtasks = getTaskSubTasks(task);
  if (operation.operation === "set_task_completed") {
    const blocked = operation.completed ? taskFormBlockers(task) : [];
    if (blocked.length > 0) throw new ToolError(FORM_INCOMPLETE_MESSAGE, FORM_INCOMPLETE_CODE, formIncompleteDetails(blocked));
    task.isCompleted = operation.completed;
    for (const subtask of subtasks) subtask.isCompleted = operation.completed;
    return answersUnchanged;
  }

  const subtask = subtasks.find((candidate) => readTextId(candidate.id) === operation.subtaskId);
  if (!subtask) throw new ToolError("Subtask not found", "subtask_not_found");
  subtask.isCompleted = operation.completed;
  task.isCompleted = subtasks.length > 0
    && subtasks.every((candidate) => candidate.isCompleted === true)
    && taskFormBlockers(task).length === 0;
  return answersUnchanged;
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

export function summarizeRunForAudit(run: Partial<RunRow>): JsonRecord {
  return Object.fromEntries(AUDITED_RUN_FIELDS.filter((field) => field in run).map((field) => [field, run[field]]));
}

interface RunAuditDiff extends JsonRecord {
  notes?: unknown;
  notesLength?: unknown;
  answer?: unknown;
  answersChanged?: unknown;
  completedAt?: unknown;
}

export function updateRunAuditDiff(
  args: UpdateRunArgs,
  existing: Pick<RunRow, "progress" | "revision">,
  updates: RunUpdates,
  outcome: RunOperationOutcome,
): RunAuditDiff {
  const { runId, expectedRevision, ...change } = args;
  const diff: RunAuditDiff = {
    ...change,
    progress: { from: typeof existing.progress === "number" ? existing.progress : 0, to: updates.progress },
    revision: { from: typeof existing.revision === "number" ? existing.revision : 1, to: updates.revision },
  };
  if (change.operation === "set_task_notes") {
    delete diff.notes;
    diff.notesLength = change.notes.length;
  }
  if (change.operation === "set_form_answer") {
    delete diff.answer;
    if (outcome.answerChanged) diff.answersChanged = [change.taskId];
  }
  if (updates.completed_at !== undefined) diff.completedAt = updates.completed_at;
  return diff;
}

function retiredRecord(entry: RetiredEntryRecord): ChecklistNodeRecord | null {
  const record = entry.kind === "section" ? entry.section
    : entry.kind === "item" ? entry.item
      : entry.kind === "formAnswer" ? entry.field : entry.subItem;
  return isChecklistNodeRecord(record) ? record : null;
}

function retiredSectionId(entry: RetiredEntryRecord): unknown {
  return entry.kind === "section" ? retiredRecord(entry)?.id : entry.sectionId;
}

function retiredEntriesForTask(entries: RetiredEntryRecord[], taskId: string): RetiredEntryRecord[] {
  return entries.flatMap((entry) => {
    if (entry.kind === "item") return retiredRecord(entry)?.id === taskId ? [entry] : [];
    if (entry.kind === "subItem" || entry.kind === "formAnswer") return entry.itemId === taskId ? [entry] : [];
    const section = entry.kind === "section" && isSectionRecord(entry.section) ? entry.section : null;
    const task = section ? taskRecordsIn(section.items).find((item) => item.id === taskId) : undefined;
    return section && task ? [{ ...entry, section: { ...section, items: [task] } }] : [];
  });
}

export function retiredWorkOf(entries: RetiredEntryRecord[], scope: SectionAndTaskIds): RetiredEntryRecord[] {
  const inSection = scope.sectionId === undefined
    ? entries
    : entries.filter((entry) => retiredSectionId(entry) === scope.sectionId);
  return scope.taskId === undefined ? inSection : retiredEntriesForTask(inSection, scope.taskId);
}
