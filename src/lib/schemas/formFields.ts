import { z } from "zod";

import {
  formFieldRecordsIn,
  formOptionRecordsIn,
  isRecord,
  readTextId,
  type FormFieldRecord,
  type FormOptionRecord,
  type JsonRecord,
} from "./jsonRecords";

export const FORM_FIELD_KINDS = [
  "text",
  "longText",
  "url",
  "email",
  "number",
  "date",
  "select",
  "multiSelect",
  "checkbox",
  "file",
] as const;

export type FormFieldKind = (typeof FORM_FIELD_KINDS)[number];

export const MAX_FORM_FIELDS = 50;
export const MAX_FORM_FIELD_OPTIONS = 50;
export const MAX_FORM_LABEL_LENGTH = 200;
export const MAX_FORM_DESCRIPTION_LENGTH = 1000;
export const MAX_FORM_TEXT_ANSWER_LENGTH = {
  text: 500,
  longText: 10_000,
  url: 2048,
  email: 254,
} as const satisfies Partial<Record<FormFieldKind, number>>;

type FormFieldOption = { id: string; label: string };
type FormFileAnswer = { url: string; fileName: string; fileSize: number };
export type FormAnswer = string | number | boolean | string[] | FormFileAnswer;

export type ChecklistFormField = {
  id: string;
  label: string;
  kind: FormFieldKind;
  required: boolean;
  description?: string | undefined;
  options?: FormFieldOption[] | undefined;
  min?: number | undefined;
  max?: number | undefined;
  answer?: FormAnswer | undefined;
};

const FORM_CHOICE_KINDS = new Set<unknown>(["select", "multiSelect"] satisfies FormFieldKind[]);
const FORM_FIELD_KIND_SET = new Set<unknown>(FORM_FIELD_KINDS);

export const isFormFieldKind = (value: unknown): value is FormFieldKind => FORM_FIELD_KIND_SET.has(value);
export const isFormChoiceKind = (kind: unknown): kind is "select" | "multiSelect" => FORM_CHOICE_KINDS.has(kind);

export const FORM_FIELD_KIND_LABELS: Record<FormFieldKind, string> = {
  text: "Short text",
  longText: "Long text",
  url: "URL",
  email: "Email",
  number: "Number",
  date: "Date",
  select: "Dropdown",
  multiSelect: "Multiple choice",
  checkbox: "Checkbox",
  file: "File",
};

const fileAnswerSchema = z.object({
  url: z.string(),
  fileName: z.string().nullish(),
  fileSize: z.number().nullish(),
}).passthrough();

const STORED_ANSWER_SCHEMAS = {
  text: z.string(),
  longText: z.string(),
  url: z.string(),
  email: z.string(),
  number: z.number(),
  date: z.string(),
  select: z.string(),
  multiSelect: z.array(z.string()),
  checkbox: z.boolean(),
  file: fileAnswerSchema,
} as const satisfies Record<FormFieldKind, z.ZodTypeAny>;

const text = z.string().nullish();
const storedOptionSchema = z.object({ label: text }).passthrough();
const storedFieldBase = {
  label: text,
  required: z.boolean().nullish(),
  description: text,
  options: z.array(storedOptionSchema).nullish(),
  min: z.number().nullish(),
  max: z.number().nullish(),
};

const storedFieldOf = <Kind extends FormFieldKind>(kind: Kind) =>
  z.object({ ...storedFieldBase, kind: z.literal(kind), answer: STORED_ANSWER_SCHEMAS[kind].nullish() }).passthrough();

export const storedFormFieldSchema = z.discriminatedUnion("kind", [
  storedFieldOf("text"),
  storedFieldOf("longText"),
  storedFieldOf("url"),
  storedFieldOf("email"),
  storedFieldOf("number"),
  storedFieldOf("date"),
  storedFieldOf("select"),
  storedFieldOf("multiSelect"),
  storedFieldOf("checkbox"),
  storedFieldOf("file"),
]);

const formOptionFallbackId = (index: number): string => `option-${index + 1}`;

export function withFormOptionIds(options: FormOptionRecord[]): Array<FormOptionRecord & { id: string }> {
  const used = new Set<string>();
  return options.map((option, index) => {
    const stored = readTextId(option.id);
    let id = stored && stored.trim() && !used.has(stored) ? stored : formOptionFallbackId(index);
    for (let copy = 2; used.has(id); copy += 1) id = `${formOptionFallbackId(index)}-${copy}`;
    used.add(id);
    return { ...option, id };
  });
}

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function storedAnswerFor(kind: FormFieldKind, answer: unknown): unknown {
  if (answer === undefined || answer === null) return undefined;
  if (kind === "number") return isFiniteNumber(answer) ? answer : undefined;
  return STORED_ANSWER_SCHEMAS[kind].safeParse(answer).success ? answer : undefined;
}

function sanitizeStoredOptions(value: unknown): FormOptionRecord[] {
  return formOptionRecordsIn(value).map((option) => ({
    ...option,
    label: typeof option.label === "string" ? option.label : "",
  }));
}

export function sanitizeStoredFormFields(value: unknown): FormFieldRecord[] {
  return formFieldRecordsIn(value).flatMap((field) => {
    const { kind } = field;
    if (!isFormFieldKind(kind)) return [];
    const { options, min, max, answer, description, ...rest } = field;
    const next: FormFieldRecord = {
      ...rest,
      label: typeof field.label === "string" ? field.label : "",
      required: field.required === true,
    };
    if (typeof description === "string") next.description = description;
    if (isFormChoiceKind(kind)) next.options = sanitizeStoredOptions(options);
    if (kind === "number" && isFiniteNumber(min)) next.min = min;
    if (kind === "number" && isFiniteNumber(max)) next.max = max;
    const storedAnswer = storedAnswerFor(kind, answer);
    if (storedAnswer !== undefined) next.answer = storedAnswer;
    return [next];
  });
}

function readFormAnswer(kind: FormFieldKind, answer: unknown): FormAnswer | undefined {
  if (kind === "file") {
    const file = fileAnswerSchema.safeParse(answer);
    return file.success
      ? { url: file.data.url, fileName: file.data.fileName ?? "", fileSize: file.data.fileSize ?? 0 }
      : undefined;
  }
  if (kind === "multiSelect") {
    const ids = STORED_ANSWER_SCHEMAS.multiSelect.safeParse(answer);
    return ids.success ? ids.data : undefined;
  }
  const value = storedAnswerFor(kind, answer);
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : undefined;
}

export function readFormFields(value: unknown, fallbackId: (index: number) => string): ChecklistFormField[] {
  return sanitizeStoredFormFields(value).flatMap((field, index) => {
    const { kind } = field;
    if (!isFormFieldKind(kind)) return [];
    const answer = readFormAnswer(kind, field.answer);
    return [{
      id: readTextId(field.id) || fallbackId(index),
      label: typeof field.label === "string" ? field.label : "",
      kind,
      required: field.required === true,
      ...(typeof field.description === "string" ? { description: field.description } : {}),
      ...(isFormChoiceKind(kind)
        ? { options: withFormOptionIds(formOptionRecordsIn(field.options)).map(({ id, label }) => ({ id, label: typeof label === "string" ? label : "" })) }
        : {}),
      ...(isFiniteNumber(field.min) ? { min: field.min } : {}),
      ...(isFiniteNumber(field.max) ? { max: field.max } : {}),
      ...(answer === undefined ? {} : { answer }),
    }];
  });
}

export function withoutFormAnswers(fields: unknown): unknown[] {
  return Array.isArray(fields)
    ? fields.map((field: unknown) => {
      if (!isRecord(field)) return field;
      const { answer, ...rest }: JsonRecord = field;
      return rest;
    })
    : [];
}
