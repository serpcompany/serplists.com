import { z } from "zod";

import {
  formOptionRecordsIn,
  readTextId,
  type FormFieldRecord,
  type TaskRecord,
} from "./jsonRecords";
import {
  isFormChoiceKind,
  isFormFieldKind,
  MAX_FORM_TEXT_ANSWER_LENGTH,
  withFormOptionIds,
  type ChecklistFormField,
  type FormFieldKind,
} from "./formFields";
import { HTTP_URL } from "./requiredTools";
import { getTaskFormFields } from "./storedSections";

export type FormFieldProblemReason = "required" | "invalid";
export type FormFieldProblem = { fieldId: string; reason: FormFieldProblemReason };

export const FORM_INCOMPLETE_CODE = "form_incomplete";

const EMAIL = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const UPLOADED_FILE_PATH = /\/api\/uploads\/file$/;
const fileAnswerUrlSchema = z.object({ url: z.string() });

export const isFormAnswerEmpty = (answer: unknown): boolean =>
  answer === undefined
  || answer === null
  || answer === false
  || (typeof answer === "string" && answer.trim() === "")
  || (Array.isArray(answer) && answer.length === 0);

const fitsText = (answer: unknown, maxLength: number): answer is string =>
  typeof answer === "string" && answer.length <= maxLength;

function isRealDate(answer: unknown): boolean {
  if (typeof answer !== "string") return false;
  const parts = ISO_DATE.exec(answer);
  if (!parts) return false;
  const [year, month, day] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isUploadedFile(answer: unknown): boolean {
  const file = fileAnswerUrlSchema.safeParse(answer);
  if (!file.success) return false;
  try {
    const { url } = file.data;
    const parsed = new URL(url, "https://serplists.com");
    const isHttp = parsed.protocol === "https:" || parsed.protocol === "http:";
    return isHttp && UPLOADED_FILE_PATH.test(parsed.pathname) && Boolean(parsed.searchParams.get("key")?.trim());
  } catch {
    return false;
  }
}

const optionIdsOf = (field: FormFieldRecord): Set<string> =>
  new Set(withFormOptionIds(formOptionRecordsIn(field.options)).map((option) => option.id));

function withinBounds(field: FormFieldRecord, answer: unknown): boolean {
  if (typeof answer !== "number" || !Number.isFinite(answer)) return false;
  const { min, max } = field;
  return (typeof min !== "number" || answer >= min) && (typeof max !== "number" || answer <= max);
}

function isValidAnswer(kind: FormFieldKind, field: FormFieldRecord): boolean {
  const { answer } = field;
  switch (kind) {
    case "text":
    case "longText":
      return fitsText(answer, MAX_FORM_TEXT_ANSWER_LENGTH[kind]);
    case "url":
      return fitsText(answer, MAX_FORM_TEXT_ANSWER_LENGTH.url) && HTTP_URL.test(answer.trim());
    case "email":
      return fitsText(answer, MAX_FORM_TEXT_ANSWER_LENGTH.email) && EMAIL.test(answer.trim());
    case "number":
      return withinBounds(field, answer);
    case "date":
      return isRealDate(answer);
    case "select":
      return typeof answer === "string" && optionIdsOf(field).has(answer);
    case "multiSelect": {
      const optionIds = optionIdsOf(field);
      return Array.isArray(answer) && answer.every((id: unknown) => typeof id === "string" && optionIds.has(id));
    }
    case "checkbox":
      return answer === true;
    case "file":
      return isUploadedFile(answer);
  }
}

export function findFormFieldProblem(field: FormFieldRecord): FormFieldProblemReason | null {
  const { kind } = field;
  if (!isFormFieldKind(kind)) return null;
  if (isFormAnswerEmpty(field.answer)) return field.required === true ? "required" : null;
  return isValidAnswer(kind, field) ? null : "invalid";
}

export function findFormFieldProblems(task: TaskRecord): FormFieldProblem[] {
  return getTaskFormFields(task).flatMap((field) => {
    const reason = findFormFieldProblem(field);
    return reason ? [{ fieldId: readTextId(field.id) ?? "", reason }] : [];
  });
}

const REQUIRED_MESSAGES: Record<FormFieldKind, string> = {
  text: "Fill in this field.",
  longText: "Fill in this field.",
  url: "Enter a URL.",
  email: "Enter an email address.",
  number: "Enter a number.",
  date: "Choose a date.",
  select: "Choose an option.",
  multiSelect: "Choose at least one option.",
  checkbox: "Check this box.",
  file: "Upload a file.",
};

function numberRangeMessage({ min, max }: Pick<ChecklistFormField, "min" | "max">): string {
  if (min !== undefined && max !== undefined) return `Enter a number from ${min} to ${max}.`;
  if (min !== undefined) return `Enter a number of at least ${min}.`;
  if (max !== undefined) return `Enter a number of at most ${max}.`;
  return "Enter a number.";
}

function invalidMessage(field: ChecklistFormField): string {
  switch (field.kind) {
    case "text":
    case "longText":
      return `Use ${MAX_FORM_TEXT_ANSWER_LENGTH[field.kind].toLocaleString("en-US")} characters or fewer.`;
    case "url":
      return "Enter a URL that starts with http:// or https://.";
    case "email":
      return "Enter an email address like name@example.com.";
    case "number":
      return numberRangeMessage(field);
    case "date":
      return "Enter a real date.";
    case "select":
    case "multiSelect":
      return "Choose from the listed options.";
    case "checkbox":
      return REQUIRED_MESSAGES.checkbox;
    case "file":
      return "Upload the file again.";
  }
}

export const formFieldProblemMessage = (field: ChecklistFormField, reason: FormFieldProblemReason): string =>
  reason === "required" ? REQUIRED_MESSAGES[field.kind] : invalidMessage(field);

export function formatFormAnswer(field: ChecklistFormField): string {
  const { answer } = field;
  if (isFormAnswerEmpty(answer) || answer === undefined) return "";
  if (typeof answer === "boolean") return "Checked";
  if (typeof answer === "number") return String(answer);
  if (typeof answer === "string") {
    return isFormChoiceKind(field.kind) ? field.options?.find((option) => option.id === answer)?.label ?? answer : answer;
  }
  if (Array.isArray(answer)) {
    return answer.map((id) => field.options?.find((option) => option.id === id)?.label ?? id).join(", ");
  }
  return answer.fileName || answer.url;
}
