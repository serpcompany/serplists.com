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
  partAndNextCursor,
  readCursorSchema,
  readSectionOrTask,
  roomForUnits,
  START,
  tasksOf,
  titleOf,
  unitOf,
  type Paged,
  type Position,
  type ReadScope,
  type ToolResult,
} from "./agentMcpPages";
import type { JsonRecord, SectionRecord } from "../../../src/lib/schemas/jsonRecords";
import {
  agentRetiredView,
  agentSectionView,
  agentTaskView,
  parseRetiredItems,
  parseStoredSections,
  retiredWorkOf,
  summarizeRun,
  type RetiredEntryRecord,
  type RunFields,
} from "./agentMcpRuns";
import { ToolError, type SectionAndTaskIds, type UpdateRunArgs } from "./agentMcpTools";

type RunHeader = ReturnType<typeof summarizeRun>;

export type RunView = { header: RunHeader; sections: SectionRecord[]; retired: RetiredEntryRecord[] };

export function runView(row: RunFields): RunView {
  return {
    header: summarizeRun(row),
    sections: parseStoredSections(row.items).map(agentSectionView),
    retired: parseRetiredItems(row).map(agentRetiredView),
  };
}

const wholeRun = ({ header, sections, retired }: RunView): JsonRecord => ({ run: { ...header, sections, retiredItems: retired } });

function pagedRun(header: RunHeader): Paged {
  return { key: "run", ref: { id: header.id, revision: header.revision }, id: String(header.id), version: Number(header.revision) };
}

const retiredStats = ({ retired }: RunView): JsonRecord => ({ retiredCount: retired.length, retiredBytes: byteSize(retired) });

const idsInCursor = (scope: SectionAndTaskIds): ReadScope => ({
  m: "retired",
  ...(scope.sectionId === undefined ? {} : { rs: scope.sectionId }),
  ...(scope.taskId === undefined ? {} : { rt: scope.taskId }),
});

function retiredPage(view: RunView, scope: SectionAndTaskIds, entries: RetiredEntryRecord[], start: Position): JsonRecord {
  const paged = pagedRun(view.header);
  const cursorScope = idsInCursor(scope);
  const longestCursor = encodeCursor({ t: paged.id, v: paged.version, ...cursorScope, u: entries.length, o: Number.MAX_SAFE_INTEGER });
  const frame = { run: paged.ref, retiredItems: [], retiredCount: entries.length, firstRetired: entries.length, nextCursor: longestCursor };
  const packed = pack(entries.map(unitOf), start, roomForUnits(frame));
  return bounded({
    run: paged.ref,
    retiredItems: entries.slice(packed.first, packed.first + packed.count),
    retiredCount: entries.length,
    firstRetired: packed.first,
    ...partAndNextCursor(paged, packed, cursorScope, (unit) => ({ of: "retiredItem", index: unit })),
  });
}

function retiredHolds(view: RunView, scope: SectionAndTaskIds): boolean {
  return retiredWorkOf(view.retired, scope).length > 0;
}

function sectionIsLive(view: RunView, sectionId: string): boolean {
  return view.sections.some((section) => section.id === sectionId);
}

function taskIsLive(view: RunView, taskId: string, sectionId?: string): boolean {
  return view.sections.some((section) => (sectionId === undefined || section.id === sectionId)
    && tasksOf(section).some((task) => task.id === taskId));
}

function readRetired(view: RunView, scope: SectionAndTaskIds): JsonRecord {
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

function refuseRetiredOnlyIds(view: RunView, { sectionId, taskId }: SectionAndTaskIds): void {
  if (taskId !== undefined && !taskIsLive(view, taskId, sectionId) && retiredHolds(view, { sectionId, taskId })) {
    throw new ToolError("Task not found (taskId): it is retired work; read it with retired: true", "task_not_found");
  }
  if (taskId === undefined && sectionId !== undefined && !sectionIsLive(view, sectionId) && retiredHolds(view, { sectionId })) {
    throw new ToolError("Section not found (sectionId): it is retired work; read it with retired: true", "section_not_found");
  }
}

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

export type RunReadArgs = SectionAndTaskIds & { retired?: boolean | undefined; cursor?: string | undefined };

export function readRun(view: RunView, args: RunReadArgs): JsonRecord {
  if (args.cursor !== undefined) return continueRead(view, args.cursor, args);
  if (args.retired === true) return readRetired(view, { sectionId: args.sectionId, taskId: args.taskId });
  refuseRetiredOnlyIds(view, args);
  const sectionOrTask = readSectionOrTask(pagedRun(view.header), view.sections, args);
  if (sectionOrTask) return sectionOrTask;
  const whole = wholeRun(view);
  return fits(whole) ? whole : outlinePage(pagedRun(view.header), view.header, view.sections, START, retiredStats(view));
}

export function describeRunRead(result: ToolResult): string {
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
  return `Loaded run "${boundedText(titleOf(result.run))}".`;
}

const minimalRun = (header: RunHeader): JsonRecord => ({
  id: header.id,
  title: boundedText(header.title),
  status: header.status,
  progress: header.progress,
  revision: header.revision,
});

const firstFittingOr = (smallest: JsonRecord, larger: JsonRecord[]): JsonRecord => larger.find(fits) ?? smallest;

export function startedRunResult(view: RunView): JsonRecord {
  return firstFittingOr({ run: minimalRun(view.header), sectionsOmitted: true }, [
    wholeRun(view),
    { run: view.header, sectionsOmitted: true },
  ]);
}

function locateTask(sections: SectionRecord[], taskId: string) {
  try {
    return findTask(sections, taskId);
  } catch {
    return undefined;
  }
}

export function updatedRunResult(header: RunHeader, sections: SectionRecord[], operation: UpdateRunArgs): JsonRecord {
  const run = fits({ run: header }) ? header : minimalRun(header);
  if (operation.operation === "set_run_status") return { run };
  const at = locateTask(sections, operation.taskId);
  const section = at ? sections[at.sectionIndex] : undefined;
  const ids = { ...(section ? frameId("sectionId", section.id) : {}), ...frameId("taskId", operation.taskId) };
  const task = at && section ? tasksOf(section)[at.taskIndex] : undefined;
  return firstFittingOr({ run: minimalRun(header), taskOmitted: true }, [
    ...(task ? [{ run, ...ids, task: agentTaskView(task) }] : []),
    { run, ...ids, taskOmitted: true },
  ]);
}
