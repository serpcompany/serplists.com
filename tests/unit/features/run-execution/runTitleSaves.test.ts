import { describe, expect, it, vi } from 'vitest';

import { checklistPayloadSchema } from '@functions/api/utils/payloads';
import { buildRunUpdatePayload, type RunUpdateOptions } from '@/contexts/runUpdatePayload';
import {
  completeRunExecution,
  saveRunExecutionTitle,
  saveRunItemNotes,
  toggleRunItem,
} from '@/features/run-execution/useRunExecutionModel';
import type { ChecklistRun } from '@/types/checklist';

// Titles had no length limit before the 160-character PUT limit, and runs started from a
// Template with a long title (MCP start_run, template share) still get one. Saving progress on
// such a run must not resend the unchanged title, or every save fails validation.
const longTitle = `Quarterly launch readiness ${'x'.repeat(150)}`;

const buildRun = (overrides: Partial<ChecklistRun> = {}): ChecklistRun => ({
  id: 'run-1',
  templateId: 'template-1',
  title: longTitle,
  status: 'in_progress',
  progress: 0,
  sections: [
    {
      id: 'section-1',
      title: 'Checklist',
      items: [
        { id: 'item-1', title: 'First item', isCompleted: false },
        { id: 'item-2', title: 'Second item', isCompleted: false },
      ],
    },
  ],
  startedAt: '2026-04-18T00:00:00.000Z',
  userId: 'user-1',
  revision: 1,
  ...overrides,
});

// Stands in for TemplatesContext.updateRun: records the PUT body it would send.
function setup() {
  const bodies: ReturnType<typeof buildRunUpdatePayload>[] = [];
  const updateRun = vi.fn(async (run: ChecklistRun, options?: RunUpdateOptions) => {
    bodies.push(buildRunUpdatePayload(run, options));
    return { ...run, revision: (run.revision ?? 1) + 1 };
  });
  const apiClient = {
    createChecklistRunShare: vi.fn(),
    getChecklistById: vi.fn(),
    getSharedChecklist: vi.fn(),
    updateSharedChecklist: vi.fn(),
  };
  return { bodies, dependencies: { apiClient, updateRun } };
}

describe('private run saves', () => {
  it('save ticks, notes and completion on a run whose stored title is over 160 characters', async () => {
    expect(longTitle.length).toBeGreaterThan(160);
    const { bodies, dependencies } = setup();

    await toggleRunItem({ isCompleted: true, itemId: 'item-1', run: buildRun() }, dependencies);
    await saveRunItemNotes({ itemId: 'item-1', notes: 'Checked with legal', run: buildRun() }, dependencies);
    // Completion needs every task done.
    const finishedRun = buildRun();
    finishedRun.sections[0].items.forEach((item) => {
      item.isCompleted = true;
    });
    await completeRunExecution({ run: finishedRun }, dependencies);

    expect(bodies).toHaveLength(3);
    for (const body of bodies) {
      expect(body).not.toHaveProperty('title');
      expect(checklistPayloadSchema.safeParse(JSON.parse(JSON.stringify(body))).success).toBe(true);
    }
  });

  it('send the title only for a rename', async () => {
    const { bodies, dependencies } = setup();

    const result = await saveRunExecutionTitle({ run: buildRun(), title: '  Launch readiness  ' }, dependencies);

    expect(result.kind).toBe('ok');
    expect(bodies).toEqual([expect.objectContaining({ title: 'Launch readiness', expected_revision: 1 })]);
  });
});
