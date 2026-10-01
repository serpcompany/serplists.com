import { expect, vi } from "vitest";
import { dbMocks } from "./mockedDrizzleD1";
import { getEntitlementsForUser } from "@functions/api/utils/entitlements";
import { authenticatePersonalRunKey, markPersonalRunKeyUsed } from "@functions/api/utils/personal-run-key";
import { mcpToolCall, runKeyWithEveryPermission } from "./agentMcp";
import { apiEnv } from "./apiEnv";
import { chainSelectsUpdatesAndDeletes } from "./drizzleChainMocks";
import { releaseSectionWithTwoSubTasks } from "../fixtures/handlerRows";
import { handleAgentMcp } from "@functions/api/handlers/agentMcp";
import { MAX_RESULT_BYTES } from "@functions/api/handlers/agentMcpPages";

vi.mock("@functions/api/utils/personal-run-key", () => ({
  authenticatePersonalRunKey: vi.fn(),
  markPersonalRunKeyUsed: vi.fn(),
}));

vi.mock("@functions/api/utils/entitlements", () => ({
  getEntitlementsForUser: vi.fn(),
}));

vi.mock("@functions/api/utils/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@functions/api/utils/audit")>();
  return { ...actual, buildAuditEventValues: vi.fn(actual.buildAuditEventValues) };
});

export { dbMocks } from "./mockedDrizzleD1";

export const env = apiEnv();

export type JsonRecord = Record<string, unknown>;

export const NO_TEMPLATE_HOLDS_THE_SLUG: JsonRecord[] = [];

export function personalRun(overrides: JsonRecord = {}): JsonRecord {
  return {
    id: "run-1",
    user_id: "user-1",
    team_id: null,
    template_id: "template-1",
    title: "Release SOP",
    items: JSON.stringify(releaseSectionWithTwoSubTasks({ title: "Verify" })),
    status: "in_progress",
    progress: 0,
    revision: 1,
    template_version: 2,
    started_at: "2026-09-19T00:00:00.000Z",
    created_at: "2026-09-19T00:00:00.000Z",
    updated_at: null,
    deleted_at: null,
    ...overrides,
  };
}

export const byteLength = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;

export function sectionsOfAtLeast(targetBytes: number, fillerNotesLength = 10_000): JsonRecord[] {
  const task1 = {
    id: "task-1",
    title: "Verify",
    isCompleted: false,
    notes: "",
    contents: [{
      type: "subItems",
      subItems: [
        { id: "sub-1", title: "Tests pass", isCompleted: false },
        { id: "sub-2", title: "Preview checked", isCompleted: false },
      ],
    }],
  };
  const items: JsonRecord[] = [task1];
  const sections = [{ id: "section-1", title: "Release", items }];
  let index = 0;
  while (byteLength(sections) < targetBytes) {
    items.push({ id: `filler-${index}`, title: `Filler ${index}`, isCompleted: false, notes: "x".repeat(fillerNotesLength) });
    index += 1;
  }
  return sections;
}

function tickEverything(sections: JsonRecord[]): JsonRecord[] {
  const tick = (record: JsonRecord) => ({ ...record, isCompleted: true });
  return sections.map((section) => ({
    ...section,
    items: (section.items as JsonRecord[]).map((item) => ({
      ...tick(item),
      ...(Array.isArray(item.contents)
        ? { contents: item.contents.map((content: JsonRecord) => ({ ...content, subItems: (content.subItems as JsonRecord[]).map(tick) })) }
        : {}),
    })),
  }));
}

export const finishedRun = (overrides: JsonRecord = {}) =>
  personalRun({ items: JSON.stringify(tickEverything(JSON.parse(personalRun().items as string))), ...overrides });

export const finishedIfCompleting = (operation: string, sections: JsonRecord[]) =>
  operation === "set_run_status" ? tickEverything(sections) : sections;

export function ownedTemplate(items: unknown[]): JsonRecord {
  return {
    id: "template-1",
    user_id: "user-1",
    owner_type: "user",
    team_id: null,
    deleted_at: null,
    title: "Release SOP",
    items: JSON.stringify(items),
    content_version: 1,
  };
}

export async function toolBody(response: Response): Promise<any> {
  return response.json();
}

export async function callTool(name: string, args: JsonRecord) {
  return toolBody(await handleAgentMcp(mcpToolCall(name, args), env));
}

function dropRowsAndBatchResultsALastTestLeftQueued() {
  dbMocks.selectChain.limit.mockReset();
  dbMocks.db.batch.mockReset();
}

export function resetAgentMcpHandlerMocks() {
  vi.clearAllMocks();
  dropRowsAndBatchResultsALastTestLeftQueued();
  chainSelectsUpdatesAndDeletes(dbMocks);
  dbMocks.selectChain.orderBy.mockReturnValue(dbMocks.selectChain);
  dbMocks.selectChain.limit.mockResolvedValue([]);
  dbMocks.insertChain.values.mockReturnValue({ kind: "insert" });
  dbMocks.insertChain.select.mockReturnValue({ kind: "conditional-insert" });
  dbMocks.db.batch.mockResolvedValue([{ meta: { changes: 1 } }, { meta: { changes: 1 } }]);
  vi.mocked(authenticatePersonalRunKey).mockResolvedValue(runKeyWithEveryPermission);
  vi.mocked(markPersonalRunKeyUsed).mockResolvedValue();
  vi.mocked(getEntitlementsForUser).mockResolvedValue({
    plan: "pro",
    limits: { maxTemplates: null, maxActiveRuns: null },
  });
}

export function everyUpdateRunOperation(setTaskNotesFields: JsonRecord): Array<[string, JsonRecord]> {
  return [
    ["set_task_completed", { taskId: "task-1", completed: true }],
    ["set_subtask_completed", { taskId: "task-1", subtaskId: "sub-1", completed: true }],
    ["set_task_notes", setTaskNotesFields],
    ["set_run_status", { status: "completed" }],
  ];
}

export async function getRunWithinTheBound(run: JsonRecord, args: JsonRecord = {}) {
  dbMocks.selectChain.limit.mockResolvedValueOnce([run]);
  const body = await callTool("get_run", { runId: "run-1", ...args });
  expect(byteLength(body.result.structuredContent)).toBeLessThanOrEqual(MAX_RESULT_BYTES);
  return body.result;
}

export function expectAToolError(body: Awaited<ReturnType<typeof callTool>>, error: Record<string, unknown>) {
  expect(body.result.isError).toBe(true);
  expect(body.result.structuredContent).toEqual(expect.objectContaining(error));
}
