import {
  callRecordingResults,
  isRecord,
  jsonTextPartsJoiner,
  type PagedResult,
  readOutlineFromItsFirstPage,
  readSectionInFull,
  type PagedRead,
} from './templatePages';
import { jsonObject, jsonObjects } from './readJson';

type JsonRecord = Record<string, unknown>;

export async function readRetiredWork(call: PagedRead, scope: JsonRecord = {}): Promise<JsonRecord[]> {
  let page = await call({ ...scope, retired: true });
  if (typeof page.firstRetired !== 'number') return jsonObjects.parse(page.retiredItems);

  const addPart = jsonTextPartsJoiner();
  const entries: JsonRecord[] = [];
  for (;;) {
    if (isRecord(page.part)) {
      const completedUnit = addPart(page.part);
      if (isRecord(completedUnit)) entries.push(completedUnit);
    } else {
      if (page.firstRetired !== entries.length) {
        throw new Error(`page starts at entry ${String(page.firstRetired)}, expected ${entries.length}`);
      }
      entries.push(...jsonObjects.parse(page.retiredItems));
    }
    if (typeof page.nextCursor !== 'string') break;
    page = await call({ cursor: page.nextCursor });
  }
  return entries;
}

export async function readRunInFull(read: PagedRead, runId: string): Promise<{ run: JsonRecord; results: PagedResult[] }> {
  const results: PagedResult[] = [];
  const call = callRecordingResults(read, { runId }, results);

  const page = await call({});
  if (page.sectionsOmitted !== true) return { run: jsonObject.parse(page.run), results };

  const { fields, outline } = await readOutlineFromItsFirstPage(call, page, 'run');
  const sections: JsonRecord[] = [];
  for (const entry of outline) sections.push(await readSectionInFull(call, entry.id));
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
