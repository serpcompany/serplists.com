import { z } from 'zod';
import type { ResponseSchema } from '@/lib/api/request';
import type { ContentRecord, SectionRecord, SubTaskRecord, TaskRecord } from '@/lib/schemas/jsonRecords';

const jsonRecords = z.array(z.record(z.unknown()));

const storedSubTasks = z.array(z.record(z.unknown()).transform((subTask): SubTaskRecord => subTask));

const storedContent = z
  .object({ subItems: storedSubTasks.optional() })
  .passthrough()
  .transform((content): typeof content & ContentRecord => content);

export const storedTask = z
  .object({ contents: z.array(storedContent).optional(), subItems: storedSubTasks.optional() })
  .passthrough()
  .transform((task): typeof task & TaskRecord => task);

export const storedSections = z.array(
  z
    .object({ items: z.array(storedTask) })
    .passthrough()
    .transform((section): typeof section & SectionRecord => section),
);

export type StoredSections = z.output<typeof storedSections>;

export type StoredTask = z.output<typeof storedTask>;

export function parseJsonText<Output>(text: unknown, schema: ResponseSchema<Output>): Output {
  return schema.parse(JSON.parse(z.string().parse(text)));
}

export const storedSectionsIn = (column: unknown): StoredSections => parseJsonText(column, storedSections);

export const jsonRecordsIn = (column: unknown) => parseJsonText(column, jsonRecords);

export const jsonRecordIn = (column: unknown) => parseJsonText(column, z.record(z.unknown()));

export interface LogLine extends Record<string, unknown> {
  level?: unknown;
  message?: unknown;
  requestId?: unknown;
  timestamp?: unknown;
}

export const logLineIn = (line: unknown): LogLine => jsonRecordIn(line);
