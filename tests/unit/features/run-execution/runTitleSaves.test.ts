import { describe, expect, it, vi } from 'vitest';
import { sectionAt } from '../../../support/elements';

import { checklistPayloadSchema } from '@functions/api/utils/payloads';
import { buildRunUpdatePayload, type RunUpdateOptions } from '@/contexts/runUpdatePayload';
import {
  completeRunExecution,
  saveRunExecutionTitle,
  saveRunItemNotes,
  toggleRunItem,
} from '@/features/run-execution/runExecutionActions';
import type { ChecklistRun } from '@/types/checklist';

import { runExecutionApiClient } from '../../../fixtures/runExecutionFixtures';

const titleOverThePutLimit = `Quarterly launch readiness ${'x'.repeat(150)}`;

const buildRun = (overrides: Partial<ChecklistRun> = {}): ChecklistRun => ({
  id: 'run-1',
  templateId: 'template-1',
  title: titleOverThePutLimit,
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

function setupUpdateRunRecordingItsPutBodies() {
  const bodies: ReturnType<typeof buildRunUpdatePayload>[] = [];
  const updateRun = vi.fn(async (run: ChecklistRun, options?: RunUpdateOptions) => {
    bodies.push(buildRunUpdatePayload(run, options));
    return { ...run, revision: (run.revision ?? 1) + 1 };
  });
  return { bodies, dependencies: { apiClient: runExecutionApiClient(), updateRun } };
}

describe('private run saves, which leave out an unchanged title, since a run started from a Template with a long title can hold one over the PUT limit', () => {
  it('save ticks, notes and completion on a run whose stored title is over 160 characters', async () => {
    expect(titleOverThePutLimit.length).toBeGreaterThan(160);
    const { bodies, dependencies } = setupUpdateRunRecordingItsPutBodies();

    await toggleRunItem({ isCompleted: true, itemId: 'item-1', run: buildRun() }, dependencies);
    await saveRunItemNotes({ itemId: 'item-1', notes: 'Checked with legal', run: buildRun() }, dependencies);
    const runWithEveryTaskDone = buildRun();
    sectionAt(runWithEveryTaskDone, 0).items.forEach((item) => {
      item.isCompleted = true;
    });
    await completeRunExecution({ run: runWithEveryTaskDone }, dependencies);

    expect(bodies).toHaveLength(3);
    for (const body of bodies) {
      expect(body).not.toHaveProperty('title');
      expect(checklistPayloadSchema.safeParse(JSON.parse(JSON.stringify(body))).success).toBe(true);
    }
  });

  it('send the title only for a rename', async () => {
    const { bodies, dependencies } = setupUpdateRunRecordingItsPutBodies();

    const result = await saveRunExecutionTitle({ run: buildRun(), title: '  Launch readiness  ' }, dependencies);

    expect(result.kind).toBe('ok');
    expect(bodies).toEqual([expect.objectContaining({ title: 'Launch readiness', expected_revision: 1 })]);
  });
});
