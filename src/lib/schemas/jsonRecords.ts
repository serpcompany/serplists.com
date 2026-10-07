export type JsonRecord = Record<string, unknown>;

export const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const recordsIn = (value: unknown): JsonRecord[] => (Array.isArray(value) ? value.filter(isRecord) : []);

export interface ChecklistNodeRecord extends JsonRecord {
  id?: unknown;
  title?: unknown;
}

export interface SubTaskRecord extends ChecklistNodeRecord {
  isCompleted?: unknown;
  completed?: unknown;
}

export interface ContentRecord extends JsonRecord {
  id?: unknown;
  type?: unknown;
  value?: unknown;
  uploadType?: unknown;
  fileName?: unknown;
  fileSize?: unknown;
  subItems?: unknown;
  fields?: unknown;
}

export interface FormFieldRecord extends JsonRecord {
  id?: unknown;
  label?: unknown;
  kind?: unknown;
  required?: unknown;
  description?: unknown;
  options?: unknown;
  min?: unknown;
  max?: unknown;
  answer?: unknown;
}

export interface FormOptionRecord extends JsonRecord {
  id?: unknown;
  label?: unknown;
}

export interface TaskRecord extends ChecklistNodeRecord {
  description?: unknown;
  notes?: unknown;
  isCompleted?: unknown;
  completed?: unknown;
  contents?: unknown;
  subItems?: unknown;
}

export interface SectionRecord extends ChecklistNodeRecord {
  items?: unknown;
}

export const readTextId = (id: unknown): string | undefined =>
  typeof id === "string" ? id : typeof id === "number" && Number.isFinite(id) ? String(id) : undefined;

export const isChecklistNodeRecord = (value: unknown): value is ChecklistNodeRecord => isRecord(value);
export const isSectionRecord = (value: unknown): value is SectionRecord => isRecord(value);
export const isTaskRecord = (value: unknown): value is TaskRecord => isRecord(value);
export const isContentRecord = (value: unknown): value is ContentRecord => isRecord(value);
export const isSubTaskRecord = (value: unknown): value is SubTaskRecord => isRecord(value);
export const isFormFieldRecord = (value: unknown): value is FormFieldRecord => isRecord(value);

export const sectionRecordsIn = (value: unknown): SectionRecord[] => recordsIn(value);
export const taskRecordsIn = (value: unknown): TaskRecord[] => recordsIn(value);
export const contentRecordsIn = (value: unknown): ContentRecord[] => recordsIn(value);
export const subTaskRecordsIn = (value: unknown): SubTaskRecord[] => recordsIn(value);
export const formFieldRecordsIn = (value: unknown): FormFieldRecord[] => recordsIn(value);
export const formOptionRecordsIn = (value: unknown): FormOptionRecord[] => recordsIn(value);
