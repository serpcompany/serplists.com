export const TEMPLATE_CONTENT_MAX_BYTES = 768 * 1024;
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

const UUID_LENGTH = 36;
const LONGEST_GENERATED_ID = "x".repeat("content_".length + UUID_LENGTH);
const idOrGenerated = (value: unknown) => (isBlank(value) ? LONGEST_GENERATED_ID : value);

const withSubTaskDefaults = (subTask: JsonRecord): JsonRecord => ({
  ...subTask,
  id: idOrGenerated(subTask.id),
  title: typeof subTask.title === "string" ? subTask.title : "",
  isCompleted: false,
});

function withContentDefaults(content: JsonRecord, usedContentIds: Set<unknown>): JsonRecord {
  const editorGivesNewId = isBlank(content.id) || usedContentIds.has(content.id);
  const id = editorGivesNewId ? LONGEST_GENERATED_ID : content.id;
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
  title: isBlank(task.title) ? `Task ${index + 1}` : task.title,
  description: typeof task.description === "string" ? task.description : "",
  isCompleted: false,
  contents: records(task.contents).map((content) => withContentDefaults(content, usedContentIds)),
  ...(Array.isArray(task.subItems) ? { subItems: records(task.subItems).map(withSubTaskDefaults) } : {}),
});

const placeholderTaskOfEmptySection = (section: JsonRecord): JsonRecord => ({
  id: `${typeof section.id === "string" ? section.id : LONGEST_GENERATED_ID}-first-task-99999`,
  title: "New task",
  description: "",
  isCompleted: false,
});

export function contentSaveBytes(sections: unknown): number {
  const usedContentIds = new Set<unknown>();
  const withDefaults = records(sections).map((section, index) => {
    const tasks = records(section.items);
    return {
      ...section,
      id: idOrGenerated(section.id),
      title: isBlank(section.title) ? `Section ${index + 1}` : section.title,
      items: tasks.length > 0 ? tasks.map(withTaskDefaults(usedContentIds)) : [placeholderTaskOfEmptySection(section)],
    };
  });
  return new TextEncoder().encode(JSON.stringify(withDefaults)).byteLength;
}
