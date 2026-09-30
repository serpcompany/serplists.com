import { normalizeSectionsPayload, parseJsonArray } from "./payloads";

export type JsonRecord = Record<string, unknown>;

export class ToolError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly details?: JsonRecord,
  ) {
    super(message);
  }
}

export const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function parseStoredSections(value: unknown): JsonRecord[] {
  const normalized = normalizeSectionsPayload(parseJsonArray(value) ?? []);
  return normalized.sections.filter(isRecord);
}
