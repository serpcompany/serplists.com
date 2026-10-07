import { FORM_FIELD_KIND_LABELS } from '@/lib/schemas/formFields';
import { formatFormAnswer } from '@/lib/schemas/formValidation';
import type { DownloadableFile } from '@/lib/utils/downloadFile';
import { generateSlug } from '@/lib/utils/slug';
import type { ChecklistFormField, ChecklistItem, ChecklistRun, ChecklistSection, FormAnswer } from '@/types/checklist';

export type RunAnswersExportFormat = 'csv' | 'json';

type ExportedTemplate = { id: string; title: string | null };

type RunAnswersExportOptions = {
  exportedAt: string;
  origin?: string | undefined;
  template?: ExportedTemplate | undefined;
};

type RunFormAnswer = { section: ChecklistSection; task: ChecklistItem; field: ChecklistFormField };
type FileAnswer = Extract<FormAnswer, { url: string }>;

const CSV_COLUMNS = ['Section', 'Task', 'Field', 'Type', 'Required', 'Answer', 'Task done'];
const CSV_BYTE_ORDER_MARK = String.fromCharCode(0xfeff);
const CSV_LINE_BREAK = '\r\n';
const SPREADSHEET_FORMULA_START = /^[=+\-@\t\r]/;
const CSV_QUOTED_CHARACTERS = /[",\r\n]/;
const FALLBACK_FILE_NAME = 'run-answers';

const MIME_TYPES: Record<RunAnswersExportFormat, string> = {
  csv: 'text/csv;charset=utf-8',
  json: 'application/json',
};

const taskFormFields = (task: ChecklistItem): ChecklistFormField[] =>
  (task.contents ?? []).flatMap((content) => (content.type === 'form' ? (content.fields ?? []) : []));

const listRunFormAnswers = (run: Pick<ChecklistRun, 'sections'>): RunFormAnswer[] =>
  run.sections.flatMap((section) =>
    section.items.flatMap((task) => taskFormFields(task).map((field) => ({ section, task, field }))),
  );

export const runHasFormFields = (run: Pick<ChecklistRun, 'sections'>): boolean =>
  run.sections.some((section) => section.items.some((task) => taskFormFields(task).length > 0));

const absoluteUrl = (url: string, origin: string | undefined): string => {
  if (!origin) return url;
  try {
    return new URL(url, origin).href;
  } catch {
    return url;
  }
};

const isFileAnswer = (answer: FormAnswer | undefined): answer is FileAnswer =>
  typeof answer === 'object' && !Array.isArray(answer);

function fileAnswerText({ fileName, url }: FileAnswer, origin: string | undefined): string {
  const link = url.trim() ? absoluteUrl(url, origin) : '';
  return fileName && link ? `${fileName} (${link})` : fileName || link;
}

const exportedAnswerText = (field: ChecklistFormField, origin: string | undefined): string =>
  isFileAnswer(field.answer) ? fileAnswerText(field.answer, origin) : formatFormAnswer(field);

const yesOrNo = (value: boolean): string => (value ? 'Yes' : 'No');

function csvCell(text: string): string {
  const inert = SPREADSHEET_FORMULA_START.test(text) ? `'${text}` : text;
  return CSV_QUOTED_CHARACTERS.test(inert) ? `"${inert.replace(/"/g, '""')}"` : inert;
}

export function buildRunAnswersCsv(run: Pick<ChecklistRun, 'sections'>, origin?: string): string {
  const rows = listRunFormAnswers(run).map(({ section, task, field }) => [
    section.title,
    task.title,
    field.label,
    FORM_FIELD_KIND_LABELS[field.kind],
    yesOrNo(field.required),
    exportedAnswerText(field, origin),
    yesOrNo(task.isCompleted === true),
  ]);
  const lines = [CSV_COLUMNS, ...rows].map((row) => row.map(csvCell).join(','));
  return `${CSV_BYTE_ORDER_MARK}${lines.join(CSV_LINE_BREAK)}${CSV_LINE_BREAK}`;
}

function knownTemplate(run: ChecklistRun, template: ExportedTemplate | undefined): ExportedTemplate | undefined {
  if (template) return template;
  const recorded = run.provenance?.template;
  return recorded?.id ? { id: recorded.id, title: recorded.title } : undefined;
}

export function buildRunAnswersJson(run: ChecklistRun, options: RunAnswersExportOptions): string {
  const template = knownTemplate(run, options.template);
  const exported = {
    run: {
      id: run.id,
      title: run.title,
      status: run.status,
      startedAt: run.startedAt,
      completedAt: run.completedAt ?? null,
      ...(template ? { template } : {}),
    },
    exportedAt: options.exportedAt,
    answers: listRunFormAnswers(run).map(({ section, task, field }) => ({
      section: { id: section.id, title: section.title },
      task: { id: task.id, title: task.title, isCompleted: task.isCompleted === true },
      field: { id: field.id, label: field.label, kind: field.kind, required: field.required },
      answer: field.answer ?? null,
      answerText: exportedAnswerText(field, options.origin),
    })),
  };
  return `${JSON.stringify(exported, null, 2)}\n`;
}

export const runAnswersFileName = (runTitle: string, format: RunAnswersExportFormat): string => {
  const slug = generateSlug(runTitle);
  return `${slug ? `${slug}-answers` : FALLBACK_FILE_NAME}.${format}`;
};

export const buildRunAnswersFile = (
  run: ChecklistRun,
  format: RunAnswersExportFormat,
  options: RunAnswersExportOptions,
): DownloadableFile => ({
  content: format === 'csv' ? buildRunAnswersCsv(run, options.origin) : buildRunAnswersJson(run, options),
  fileName: runAnswersFileName(run.title, format),
  type: MIME_TYPES[format],
});
