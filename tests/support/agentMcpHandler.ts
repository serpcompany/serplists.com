import { vi } from "vitest";
import { getEntitlementsForUser } from "@functions/api/utils/entitlements";
import { authenticatePersonalRunKey, markPersonalRunKeyUsed } from "@functions/api/utils/personal-run-key";
import { runKeyWithEveryPermission } from "./agentMcp";
import { apiEnv } from "./apiEnv";

const dbMocks = vi.hoisted(() => {
  const selectChain = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
  };
  const insertChain = { values: vi.fn(), select: vi.fn() };
  const updateChain = { set: vi.fn(), where: vi.fn() };
  const db = {
    select: vi.fn(() => selectChain),
    insert: vi.fn(() => insertChain),
    update: vi.fn(() => updateChain),
    batch: vi.fn(),
  };
  return { db, insertChain, selectChain, updateChain };
});

vi.mock("drizzle-orm/d1", () => ({ drizzle: vi.fn(() => dbMocks.db) }));

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

export { dbMocks };

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
    items: JSON.stringify([{
      id: "section-1",
      title: "Release",
      items: [{
        id: "task-1",
        title: "Verify",
        isCompleted: false,
        contents: [{
          type: "subItems",
          subItems: [
            { id: "sub-1", title: "Tests pass", isCompleted: false },
            { id: "sub-2", title: "Preview checked", isCompleted: false },
          ],
        }],
      }],
    }]),
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

function dropRowsAndBatchResultsALastTestLeftQueued() {
  dbMocks.selectChain.limit.mockReset();
  dbMocks.db.batch.mockReset();
}

export function resetAgentMcpHandlerMocks() {
  vi.clearAllMocks();
  dropRowsAndBatchResultsALastTestLeftQueued();
  dbMocks.selectChain.from.mockReturnValue(dbMocks.selectChain);
  dbMocks.selectChain.where.mockReturnValue(dbMocks.selectChain);
  dbMocks.selectChain.orderBy.mockReturnValue(dbMocks.selectChain);
  dbMocks.selectChain.limit.mockResolvedValue([]);
  dbMocks.insertChain.values.mockReturnValue({ kind: "insert" });
  dbMocks.insertChain.select.mockReturnValue({ kind: "conditional-insert" });
  dbMocks.updateChain.set.mockReturnValue(dbMocks.updateChain);
  dbMocks.updateChain.where.mockReturnValue(dbMocks.updateChain);
  dbMocks.db.batch.mockResolvedValue([{ meta: { changes: 1 } }, { meta: { changes: 1 } }]);
  vi.mocked(authenticatePersonalRunKey).mockResolvedValue(runKeyWithEveryPermission);
  vi.mocked(markPersonalRunKeyUsed).mockResolvedValue();
  vi.mocked(getEntitlementsForUser).mockResolvedValue({
    plan: "pro",
    limits: { maxTemplates: null, maxActiveRuns: null },
  });
}
