// Reads a template through MCP get_template the way an agent does
// (functions/api/handlers/agentMcpTemplatePages.ts): whole when it fits, otherwise the outline
// (following nextCursor), then each section by id (following nextCursor), joining the parts of
// anything too large for one result. Used by the unit and local D1 tests to show that every
// template can be read in full.

type JsonRecord = Record<string, unknown>;

export type TemplateRead = (args: JsonRecord) => Promise<JsonRecord> | JsonRecord;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// Joins consecutive parts of one unit's JSON text; returns the unit with its last part.
function partJoiner() {
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

async function readSection(call: TemplateRead, sectionId: unknown): Promise<JsonRecord> {
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
 * The template as a whole get_template result would hold it, read in as many calls as it
 * takes, and every result on the way.
 */
export async function readTemplateInFull(
  read: TemplateRead,
  templateId: string,
): Promise<{ template: JsonRecord; results: JsonRecord[] }> {
  const results: JsonRecord[] = [];
  const call = async (args: JsonRecord) => {
    const result = await read({ templateId, ...args });
    results.push(result);
    return result;
  };

  let page = await call({});
  if (page.sectionsOmitted !== true) return { template: page.template as JsonRecord, results };

  const join = partJoiner();
  let fields: JsonRecord | undefined;
  const outline: JsonRecord[] = [];
  for (;;) {
    if (isRecord(page.part)) {
      const value = join(page.part);
      if (isRecord(value)) {
        if (page.part.of === 'template') fields = value;
        else outline.push(value);
      }
    } else {
      // The outline's first page carries the template's fields, unless they came in parts.
      fields ??= page.template as JsonRecord;
      outline.push(...(page.outline as JsonRecord[]));
    }
    if (typeof page.nextCursor !== 'string') break;
    page = await call({ cursor: page.nextCursor });
  }

  const sections: JsonRecord[] = [];
  for (const entry of outline) sections.push(await readSection(call, entry.id));
  const { sectionCount: _sectionCount, taskCount: _taskCount, bytes: _bytes, ...header } = fields ?? {};
  return { template: { ...header, sections }, results };
}
