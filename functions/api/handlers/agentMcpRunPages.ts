import {
  bounded,
  boundedText,
  byteSize,
  continuePage,
  decodeCursor,
  describePage,
  encodeCursor,
  findTask,
  fits,
  frameId,
  invalidCursor,
  outlinePage,
  pack,
  paging,
  readCursorSchema,
  readSectionOrTask,
  START,
  tasksOf,
  unitOf,
  unitRoom,
  type Paged,
  type Position,
  type ReadScope,
} from "./agentMcpPages";
import {
  agentRetiredView,
  agentSectionView,
  agentTaskView,
  parseRetiredItems,
  parseStoredSections,
  retiredWorkOf,
  summarizeRun,
} from "./agentMcpRuns";
import { isRecord, ToolError, type JsonRecord, type UpdateRunArgs } from "./agentMcpTools";

// What the run tools return, each result within MAX_RESULT_BYTES (agentMcpPages.ts), read the way
// get_template reads a template. get_run returns a run whole when it fits. A larger one comes back
// as an outline of its sections (and how much retired work it holds), and sectionId or taskId
// reads one section or task: a section too large for one result comes back a page of whole tasks
// at a time, and anything too large for a result on its own (a task with very long notes, the
// run's fields) as parts of its JSON text. retired: true reads the work template changes removed
// (retiredItems) the same way, a page of whole entries at a time, all of it or one section's or
// task's. A result with more to read has nextCursor, which holds the run's revision: a read never
// mixes two revisions, and fails with edit_conflict once the run changes.

export type RunView = { header: JsonRecord; sections: JsonRecord[]; retired: JsonRecord[] };

/** The run as an agent reads it: its fields, its sections (agentSectionView) and its retired work. */
export function runView(row: JsonRecord): RunView {
  return {
    header: summarizeRun(row),
    sections: parseStoredSections(row.items).map(agentSectionView),
    retired: parseRetiredItems(row).map(agentRetiredView),
  };
}

const wholeRun = ({ header, sections, retired }: RunView): JsonRecord => ({ run: { ...header, sections, retiredItems: retired } });

// Names the run on a page that does not carry its fields; cursors hold its revision.
function pagedRun(header: JsonRecord): Paged {
  return { key: "run", ref: { id: header.id, revision: header.revision }, id: String(header.id), version: Number(header.revision) };
}

// How much retired work an outline's run holds, which retired: true reads.
const retiredStats = ({ retired }: RunView): JsonRecord => ({ retiredCount: retired.length, retiredBytes: byteSize(retired) });

type RetiredScope = { sectionId?: string; taskId?: string };

const idsInCursor = (scope: RetiredScope): ReadScope => ({
  m: "retired",
  ...(scope.sectionId === undefined ? {} : { rs: scope.sectionId }),
  ...(scope.taskId === undefined ? {} : { rt: scope.taskId }),
});

/** A page of retired work too large for one result: whole entries while they fit, then parts. */
function retiredPage(view: RunView, scope: RetiredScope, entries: JsonRecord[], start: Position): JsonRecord {
  const paged = pagedRun(view.header);
  const cursorScope = idsInCursor(scope);
  // The page keeps room for the longest cursor it could hold: the scope's ids travel in it.
  const longestCursor = encodeCursor({ t: paged.id, v: paged.version, ...cursorScope, u: entries.length, o: Number.MAX_SAFE_INTEGER });
  const frame = { run: paged.ref, retiredItems: [], retiredCount: entries.length, firstRetired: entries.length, nextCursor: longestCursor };
  const packed = pack(entries.map(unitOf), start, unitRoom(frame));
  return bounded({
    run: paged.ref,
    retiredItems: entries.slice(packed.first, packed.first + packed.count),
    retiredCount: entries.length,
    firstRetired: packed.first,
    ...paging(paged, packed, cursorScope, (unit) => ({ of: "retiredItem", index: unit })),
  });
}

function retiredHolds(view: RunView, scope: RetiredScope): boolean {
  return retiredWorkOf(view.retired, scope).length > 0;
}

function sectionIsLive(view: RunView, sectionId: string): boolean {
  return view.sections.some((section) => section.id === sectionId);
}

function taskIsLive(view: RunView, taskId: string, sectionId?: string): boolean {
  return view.sections.some((section) => (sectionId === undefined || section.id === sectionId)
    && tasksOf(section).some((task) => task.id === taskId));
}

// retired: true, with or without a section or task. An id neither live nor retired work holds is
// not found; a live one without retired work reads as no entries.
function readRetired(view: RunView, scope: RetiredScope): JsonRecord {
  const { sectionId, taskId } = scope;
  if (sectionId !== undefined && !sectionIsLive(view, sectionId) && !retiredHolds(view, { sectionId })) {
    throw new ToolError("Section not found (sectionId)", "section_not_found");
  }
  if (taskId !== undefined && !taskIsLive(view, taskId, sectionId) && !retiredHolds(view, scope)) {
    throw new ToolError(`Task not found (${sectionId === undefined ? "taskId" : "taskId in sectionId"})`, "task_not_found");
  }
  const entries = retiredWorkOf(view.retired, scope);
  const whole = { run: pagedRun(view.header).ref, retiredItems: entries };
  return fits(whole) ? whole : retiredPage(view, scope, entries, START);
}

// A section or task only retired work holds is named as such, so the agent reads it there.
function assertLive(view: RunView, { sectionId, taskId }: RetiredScope): void {
  if (taskId !== undefined && !taskIsLive(view, taskId, sectionId) && retiredHolds(view, { sectionId, taskId })) {
    throw new ToolError("Task not found (taskId): it is retired work; read it with retired: true", "task_not_found");
  }
  if (taskId === undefined && sectionId !== undefined && !sectionIsLive(view, sectionId) && retiredHolds(view, { sectionId })) {
    throw new ToolError("Section not found (sectionId): it is retired work; read it with retired: true", "section_not_found");
  }
}

// The page a cursor asks for, once it is known to belong to this revision of this run.
function continueRead(view: RunView, value: string, args: RunReadArgs): JsonRecord {
  const cursor = decodeCursor(value, readCursorSchema, "get_run");
  const { header, sections } = view;
  if (cursor.t !== header.id) throw invalidCursor("It belongs to another run");
  if (cursor.v !== header.revision) {
    throw new ToolError("Run changed since this read started; read it again without a cursor", "edit_conflict", {
      expectedRevision: cursor.v,
      currentRevision: header.revision,
    });
  }
  const readsRetired = cursor.m === "retired";
  if ((args.retired ?? readsRetired) !== readsRetired
    || (readsRetired && ((args.sectionId ?? cursor.rs) !== cursor.rs || (args.taskId ?? cursor.rt) !== cursor.rt))) {
    throw invalidCursor("It continues another read; pass it with runId alone");
  }
  if (!readsRetired) return continuePage(pagedRun(header), header, sections, cursor, args, retiredStats(view));
  const scope = { sectionId: cursor.rs, taskId: cursor.rt };
  return retiredPage(view, scope, retiredWorkOf(view.retired, scope), { unit: cursor.u, offset: cursor.o });
}

export type RunReadArgs = { sectionId?: string; taskId?: string; retired?: boolean; cursor?: string };

/** get_run's result (see the notes at the top). */
export function readRun(view: RunView, args: RunReadArgs): JsonRecord {
  if (args.cursor !== undefined) return continueRead(view, args.cursor, args);
  if (args.retired === true) return readRetired(view, { sectionId: args.sectionId, taskId: args.taskId });
  if (args.taskId !== undefined || args.sectionId !== undefined) {
    assertLive(view, args);
    return readSectionOrTask(pagedRun(view.header), view.sections, args);
  }
  const whole = wholeRun(view);
  return fits(whole) ? whole : outlinePage(pagedRun(view.header), view.header, view.sections, START, retiredStats(view));
}

/** The line get_run's result starts its text with, for clients that show text. */
export function describeRunRead(result: JsonRecord): string {
  const page = describePage(result, "get_run", "Run");
  if (page) return page;
  if (Array.isArray(result.retiredItems)) {
    const count = result.retiredItems.length;
    if (typeof result.firstRetired !== "number" || typeof result.retiredCount !== "number") {
      return `Loaded ${count} retired ${count === 1 ? "entry" : "entries"}.`;
    }
    const more = typeof result.nextCursor === "string" ? " More follows: call get_run with cursor set to nextCursor." : "";
    const entries = count === 0 ? "none" : `${result.firstRetired + 1}-${result.firstRetired + count}`;
    return `Loaded retired entries ${entries} of the ${result.retiredCount}, too many for one result.${more}`;
  }
  const run = isRecord(result.run) ? result.run : {};
  return `Loaded run "${boundedText(run.title)}".`;
}

// ---- Write results --------------------------------------------------------------------

// The run's id, title, status, progress and revision, for a run whose fields do not fit.
const minimalRun = (header: JsonRecord): JsonRecord => ({
  id: header.id,
  title: boundedText(header.title),
  status: header.status,
  progress: header.progress,
  revision: header.revision,
});

const firstFitting = (candidates: JsonRecord[]): JsonRecord => candidates.find(fits) ?? candidates[candidates.length - 1];

/**
 * start_run's result: the new run whole when it fits in one result, otherwise its fields with
 * sectionsOmitted, to read with get_run. The run is already stored, so this never fails.
 */
export function startedRunResult(view: RunView): JsonRecord {
  return firstFitting([
    wholeRun(view),
    { run: view.header, sectionsOmitted: true },
    { run: minimalRun(view.header), sectionsOmitted: true },
  ]);
}

function locateTask(sections: JsonRecord[], taskId: string) {
  try {
    return findTask(sections, taskId);
  } catch {
    return undefined;
  }
}

/**
 * update_run's result: the run's fields with its new revision and, after a task operation, the
 * task (sectionId and taskId name it) as the agent reads it, when it fits in one result. The write
 * has already committed, so this never fails: a task too large to return is left out
 * (taskOmitted), to read with get_run and taskId.
 */
export function updatedRunResult(header: JsonRecord, sections: JsonRecord[], operation: UpdateRunArgs): JsonRecord {
  const run = fits({ run: header }) ? header : minimalRun(header);
  if (operation.operation === "set_run_status") return { run };
  const at = locateTask(sections, operation.taskId);
  const section = at ? sections[at.sectionIndex] : undefined;
  const ids = { ...(section ? frameId("sectionId", section.id) : {}), ...frameId("taskId", operation.taskId) };
  const task = at && section ? tasksOf(section)[at.taskIndex] : undefined;
  return firstFitting([
    ...(task ? [{ run, ...ids, task: agentTaskView(task) }] : []),
    { run, ...ids, taskOmitted: true },
    { run: minimalRun(header), taskOmitted: true },
  ]);
}
