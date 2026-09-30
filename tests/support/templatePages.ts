// Reads a template through MCP get_template the way an agent does
// (functions/api/handlers/agentMcpTemplatePages.ts): whole when it fits, otherwise the outline
// (following nextCursor), then each section by id (following nextCursor), joining the parts of
// anything too large for one result. Used by the unit and local D1 tests to show that every
// template can be read in full; runPages.ts reads runs the same way.

type JsonRecord = Record<string, unknown>;

export type PagedRead = (args: JsonRecord) => Promise<JsonRecord> | JsonRecord;
export type TemplateRead = PagedRead;

export const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// Joins consecutive parts of one unit's JSON text; returns the unit with its last part.
export function partJoiner() {
  let text = '';
  let expectedFrom = 0;
  return (part: JsonRecord): unknown => {
    if (part.from !== expectedFrom) throw new Error(`part starts at ${String(part.from)}, expected ${expectedFrom}`);
    text += String(part.text);
    expectedFrom = Number(part.to);
    if (part.to !== part.length) return undefined;
    const value: unknown = JSON.parse(text);
    text = '';
    expectedFrom = 0;
    return value;
  };
}

/** One section by id, whole or a page of tasks at a time, joining the parts of anything larger. */
export async function readSection(call: PagedRead, sectionId: unknown): Promise<JsonRecord> {
  let page = await call({ sectionId });
  const first = page.section as JsonRecord | undefined;
  if (first && typeof first.taskCount !== 'number') return first;

  const join = partJoiner();
  let fields: JsonRecord | undefined;
  const tasks: JsonRecord[] = [];
  for (;;) {
    if (isRecord(page.part)) {
      const value = join(page.part);
      if (isRecord(value)) {
        if (page.part.of === 'section') fields = value;
        else tasks.push(value);
      }
    } else {
      const { taskCount: _taskCount, firstTask, items, ...rest } = page.section as JsonRecord;
      // A section's first page carries its fields, unless they came in parts.
      fields ??= rest;
      if (firstTask !== tasks.length) throw new Error(`page starts at task ${String(firstTask)}, expected ${tasks.length}`);
      tasks.push(...(items as JsonRecord[]));
    }
    if (typeof page.nextCursor !== 'string') break;
    page = await call({ cursor: page.nextCursor });
  }
  return { ...fields, items: tasks };
}

/**
 * An outline read from its first page (already called) to its last: the fields of the template or
 * run (stored under `key`) and every outline entry.
 */
export async function readOutline(
  call: PagedRead,
  firstPage: JsonRecord,
  key: 'template' | 'run',
): Promise<{ fields: JsonRecord; outline: JsonRecord[] }> {
  const join = partJoiner();
  let fields: JsonRecord | undefined;
  const outline: JsonRecord[] = [];
  let page = firstPage;
  for (;;) {
    if (isRecord(page.part)) {
      const value = join(page.part);
      if (isRecord(value)) {
        if (page.part.of === key) fields = value;
        else outline.push(value);
      }
    } else {
      // The outline's first page carries the fields, unless they came in parts.
      fields ??= page[key] as JsonRecord;
      outline.push(...(page.outline as JsonRecord[]));
    }
    if (typeof page.nextCursor !== 'string') break;
    page = await call({ cursor: page.nextCursor });
  }
  return { fields: fields ?? {}, outline };
}

/** Calls `read` with `extra` arguments on each call, recording every result. */
export function recordingCall(read: PagedRead, extra: JsonRecord, results: JsonRecord[]): PagedRead {
  return async (args: JsonRecord) => {
    const result = await read({ ...extra, ...args });
    results.push(result);
    return result;
  };
}

/**
 * The template as a whole get_template result would hold it, read in as many calls as it
 * takes, and every result on the way.
 */
export async function readTemplateInFull(
  read: TemplateRead,
  templateId: string,
): Promise<{ template: JsonRecord; results: JsonRecord[] }> {
  const results: JsonRecord[] = [];
  const call = recordingCall(read, { templateId }, results);

  const page = await call({});
  if (page.sectionsOmitted !== true) return { template: page.template as JsonRecord, results };

  const { fields, outline } = await readOutline(call, page, 'template');
  const sections: JsonRecord[] = [];
  for (const entry of outline) sections.push(await readSection(call, entry.id));
  const { sectionCount: _sectionCount, taskCount: _taskCount, bytes: _bytes, ...header } = fields;
  return { template: { ...header, sections }, results };
}
