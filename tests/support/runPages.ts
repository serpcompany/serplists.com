// Reads a run through MCP get_run the way an agent does (functions/api/handlers/agentMcpRunPages.ts):
// whole when it fits, otherwise the outline (following nextCursor), each section by id (following
// nextCursor), then its retired work with retired: true, a page of whole entries at a time,
// joining the parts of anything too large for one result. Used by the unit and local D1 tests to
// show that every run can be read in full.

import { isRecord, partJoiner, readOutline, readSection, recordingCall, type PagedRead } from './templatePages';

type JsonRecord = Record<string, unknown>;

/** Retired work (all of it, or the scope `args` names), whole or a page of entries at a time. */
export async function readRetiredWork(call: PagedRead, args: JsonRecord = {}): Promise<JsonRecord[]> {
  let page = await call({ ...args, retired: true });
  if (typeof page.firstRetired !== 'number') return page.retiredItems as JsonRecord[];

  const join = partJoiner();
  const entries: JsonRecord[] = [];
  for (;;) {
    if (isRecord(page.part)) {
      const value = join(page.part);
      if (isRecord(value)) entries.push(value);
    } else {
      if (page.firstRetired !== entries.length) {
        throw new Error(`page starts at entry ${String(page.firstRetired)}, expected ${entries.length}`);
      }
      entries.push(...(page.retiredItems as JsonRecord[]));
    }
    if (typeof page.nextCursor !== 'string') break;
    page = await call({ cursor: page.nextCursor });
  }
  return entries;
}

/**
 * The run as a whole get_run result would hold it, read in as many calls as it takes, and every
 * result on the way.
 */
export async function readRunInFull(read: PagedRead, runId: string): Promise<{ run: JsonRecord; results: JsonRecord[] }> {
  const results: JsonRecord[] = [];
  const call = recordingCall(read, { runId }, results);

  const page = await call({});
  if (page.sectionsOmitted !== true) return { run: page.run as JsonRecord, results };

  const { fields, outline } = await readOutline(call, page, 'run');
  const sections: JsonRecord[] = [];
  for (const entry of outline) sections.push(await readSection(call, entry.id));
  const retiredItems = await readRetiredWork(call);
  const {
    sectionCount: _sectionCount,
    taskCount: _taskCount,
    bytes: _bytes,
    retiredCount,
    retiredBytes: _retiredBytes,
    ...header
  } = fields;
  if (retiredCount !== retiredItems.length) throw new Error(`read ${retiredItems.length} retired entries of ${String(retiredCount)}`);
  return { run: { ...header, sections, retiredItems }, results };
}
