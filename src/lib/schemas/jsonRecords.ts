export type JsonRecord = Record<string, unknown>;

export const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const recordsIn = (value: unknown): JsonRecord[] => (Array.isArray(value) ? value.filter(isRecord) : []);

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

export const isChecklistNodeRecord: (value: unknown) => value is ChecklistNodeRecord = isRecord;
export const isSectionRecord: (value: unknown) => value is SectionRecord = isRecord;
export const isTaskRecord: (value: unknown) => value is TaskRecord = isRecord;
export const isContentRecord: (value: unknown) => value is ContentRecord = isRecord;
export const isSubTaskRecord: (value: unknown) => value is SubTaskRecord = isRecord;

export const sectionRecordsIn: (value: unknown) => SectionRecord[] = recordsIn;
export const taskRecordsIn: (value: unknown) => TaskRecord[] = recordsIn;
export const contentRecordsIn: (value: unknown) => ContentRecord[] = recordsIn;
export const subTaskRecordsIn: (value: unknown) => SubTaskRecord[] = recordsIn;
