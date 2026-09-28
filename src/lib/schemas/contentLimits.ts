// Size limits for Template and run content (templates.items and checklist_runs.items),
// shared by every API write path and the app.
//
// A save always sends the whole content back: the editor's PUT /api/templates/:id, and a
// run's PUT /api/checklists/:id or share-link PUT on every tick, note and completion. Those
// routes take at most 1MB (functions/api/utils/body-limit.ts), so no write path may store
// content larger than a save can send again, with room for the request's other fields.
// Import takes larger requests (a file holds several Templates), so it checks each one.
// tests/unit/lib/schemas/contentLimits.test.ts checks these numbers against the body limits.

export const TEMPLATE_CONTENT_MAX_BYTES = 768 * 1024;
// A run holds its Template's content plus notes, so it may grow past the Template limit.
export const RUN_CONTENT_MAX_BYTES = 896 * 1024;

export const formatContentSizeLimit = (bytes: number): string => `${Math.floor(bytes / 1024)}KB`;

export const TEMPLATE_CONTENT_TOO_LARGE_MESSAGE =
  `Template content is too large (max ${formatContentSizeLimit(TEMPLATE_CONTENT_MAX_BYTES)}). ` +
  "Shorten it or split it into smaller templates.";
export const RUN_CONTENT_TOO_LARGE_MESSAGE =
  `Run content is too large (max ${formatContentSizeLimit(RUN_CONTENT_MAX_BYTES)}). ` +
  "Shorten its notes or its template.";

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const records = (value: unknown): JsonRecord[] => (Array.isArray(value) ? value.filter(isRecord) : []);

const isBlank = (value: unknown) => typeof value !== "string" || value.trim() === "";

// The longest id the app makes up for a record without one ("content_" and a UUID).
const GENERATED_ID = "x".repeat(44);
const idOrGenerated = (value: unknown) => (isBlank(value) ? GENERATED_ID : value);

// Completion always counts as unticked, so ticking or unticking never changes the size.
const withSubTaskDefaults = (subTask: JsonRecord): JsonRecord => ({
  ...subTask,
  id: idOrGenerated(subTask.id),
  title: typeof subTask.title === "string" ? subTask.title : "",
  isCompleted: false,
});

function withContentDefaults(content: JsonRecord, usedContentIds: Set<unknown>): JsonRecord {
  // The editor gives a block without an id, or with one already used, a new id.
  const id = isBlank(content.id) || usedContentIds.has(content.id) ? GENERATED_ID : content.id;
  usedContentIds.add(content.id);
  return {
    ...content,
    id,
    value: typeof content.value === "string" ? content.value : "",
    ...(Array.isArray(content.subItems) || content.type === "subItems"
      ? { subItems: records(content.subItems).map(withSubTaskDefaults) }
      : {}),
  };
}

const withTaskDefaults = (usedContentIds: Set<unknown>) => (task: JsonRecord, index: number): JsonRecord => ({
  ...task,
  id: idOrGenerated(task.id),
  // A blank title is saved as "Task N".
  title: isBlank(task.title) ? `Task ${index + 1}` : task.title,
  description: typeof task.description === "string" ? task.description : "",
  isCompleted: false,
  contents: records(task.contents).map((content) => withContentDefaults(content, usedContentIds)),
  ...(Array.isArray(task.subItems) ? { subItems: records(task.subItems).map(withSubTaskDefaults) } : {}),
});

// An empty section is saved with a placeholder task whose id is built from the section's.
const placeholderTask = (section: JsonRecord): JsonRecord => ({
  id: `${typeof section.id === "string" ? section.id : GENERATED_ID}-first-task-99999`,
  title: "New task",
  description: "",
  isCompleted: false,
});

/**
 * UTF-8 bytes of `sections` as the app sends them back on a save. Loading and saving fill in
 * what a stored record may lack (ids, titles, descriptions, content lists, block values and
 * completion on every task and Sub-task), so the stored JSON alone would undercount content
 * that was imported or written by hand. Unknown keys and notes are kept, as the run page keeps
 * them. If the app starts filling in another field, count it here (the contentLimits test
 * runs the editor's and run page's load and save code and fails until it is counted).
 */
export function contentSaveBytes(sections: unknown): number {
  const usedContentIds = new Set<unknown>();
  const withDefaults = records(sections).map((section, index) => {
    const tasks = records(section.items);
    return {
      ...section,
      id: idOrGenerated(section.id),
      // "Section N" when blank; the run page shows a missing title as "Checklist".
      title: isBlank(section.title) ? `Section ${index + 1}` : section.title,
      items: tasks.length > 0 ? tasks.map(withTaskDefaults(usedContentIds)) : [placeholderTask(section)],
    };
  });
  return new TextEncoder().encode(JSON.stringify(withDefaults)).byteLength;
}
