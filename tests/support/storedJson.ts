import { z } from 'zod';
import type { ResponseSchema } from '@/lib/api/request';

const jsonRecords = z.array(z.record(z.unknown()));

export const storedTask = z
  .object({
    contents: z.array(z.object({ subItems: jsonRecords.optional() }).passthrough()).optional(),
    subItems: jsonRecords.optional(),
  })
  .passthrough();

export const storedSections = z.array(z.object({ items: z.array(storedTask) }).passthrough());

export type StoredSections = z.output<typeof storedSections>;

export type StoredTask = z.output<typeof storedTask>;

export function parseJsonText<Output>(text: unknown, schema: ResponseSchema<Output>): Output {
  return schema.parse(JSON.parse(z.string().parse(text)));
}

export const storedSectionsIn = (column: unknown): StoredSections => parseJsonText(column, storedSections);

export const jsonRecordsIn = (column: unknown) => parseJsonText(column, jsonRecords);

export const jsonRecordIn = (column: unknown) => parseJsonText(column, z.record(z.unknown()));
