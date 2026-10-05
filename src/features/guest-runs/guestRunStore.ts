import { z } from 'zod';

import { RUN_CHANGED_ELSEWHERE_MESSAGE } from '@/features/run-execution/runSaver';
import { ApiError } from '@/lib/api-errors';
import { safeLocalStorage, type StringStorage } from '@/lib/browserStorage';
import { resolveRunName } from '@/lib/runs/runName';
import { RUN_TITLE_MAX } from '@/lib/schemas/nameLimits';
import {
  calculateSectionsProgress,
  normalizeSections,
  resetSectionsCompletion,
} from '@/lib/utils/checklistSections';
import type { ChecklistRun, ChecklistTemplate } from '@/types/checklist';

const KEY_PREFIX = 'serplists:guest-run';
const FORMAT = 1;

export type GuestRunStatus = ChecklistRun['status'] | 'none';

const storedGuestRunSchema = z.object({
  format: z.literal(FORMAT),
  run: z.object({
    id: z.string().min(1),
    templateId: z.string().min(1),
    title: z.string(),
    status: z.enum(['in_progress', 'completed']),
    startedAt: z.string(),
    completedAt: z.string().optional(),
    revision: z.number().int().positive(),
    sections: z.array(z.unknown()),
  }),
});

type StoredGuestRun = z.infer<typeof storedGuestRunSchema>['run'];

const listeners = new Set<() => void>();

export const subscribeToGuestRuns = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const notifyGuestRunReaders = (): void => listeners.forEach((listener) => listener());

const guestRunKey = (templateId: string): string => `${KEY_PREFIX}:${templateId}`;

const newGuestRunId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `guest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

const toRun = (stored: StoredGuestRun): ChecklistRun => {
  const sections = normalizeSections(stored.sections);
  return {
    id: stored.id,
    templateId: stored.templateId,
    title: stored.title,
    status: stored.status,
    progress: calculateSectionsProgress(sections),
    sections,
    startedAt: stored.startedAt,
    completedAt: stored.completedAt,
    revision: stored.revision,
    userId: '',
  };
};

const writeGuestRun = (run: ChecklistRun, storage: StringStorage): void => {
  const stored: StoredGuestRun = {
    id: run.id,
    templateId: run.templateId,
    title: run.title,
    status: run.status,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    revision: run.revision ?? 1,
    sections: run.sections,
  };
  storage.setItem(guestRunKey(run.templateId), JSON.stringify({ format: FORMAT, run: stored }));
  notifyGuestRunReaders();
};

export const readGuestRun = (
  templateId: string,
  storage: StringStorage = safeLocalStorage,
): ChecklistRun | null => {
  const raw = storage.getItem(guestRunKey(templateId));
  if (!raw) return null;
  try {
    const parsed = storedGuestRunSchema.safeParse(JSON.parse(raw));
    return parsed.success && parsed.data.run.templateId === templateId ? toRun(parsed.data.run) : null;
  } catch {
    return null;
  }
};

export const readGuestRunStatus = (
  templateId: string,
  storage: StringStorage = safeLocalStorage,
): GuestRunStatus => readGuestRun(templateId, storage)?.status ?? 'none';

export const startGuestRun = (
  template: Pick<ChecklistTemplate, 'id' | 'sections' | 'title'>,
  runName?: string,
  storage: StringStorage = safeLocalStorage,
): ChecklistRun => {
  const active = readGuestRun(template.id, storage);
  if (active?.status === 'in_progress') return active;

  const startedAt = new Date();
  const run: ChecklistRun = {
    id: newGuestRunId(),
    templateId: template.id,
    title: resolveRunName(runName, template.title, startedAt).slice(0, RUN_TITLE_MAX).trimEnd(),
    status: 'in_progress',
    progress: 0,
    sections: resetSectionsCompletion(template.sections),
    startedAt: startedAt.toISOString(),
    revision: 1,
    userId: '',
  };
  writeGuestRun(run, storage);
  return run;
};

export const saveGuestRun = (
  run: ChecklistRun,
  storage: StringStorage = safeLocalStorage,
): ChecklistRun => {
  const stored = readGuestRun(run.templateId, storage);
  if (stored?.id !== run.id || stored.revision !== run.revision) {
    throw new ApiError({ status: 409, code: 'edit_conflict', message: RUN_CHANGED_ELSEWHERE_MESSAGE });
  }

  const saved: ChecklistRun = { ...run, revision: (stored.revision ?? 1) + 1 };
  writeGuestRun(saved, storage);
  return saved;
};

export const removeGuestRun = (templateId: string, storage: StringStorage = safeLocalStorage): void => {
  storage.removeItem(guestRunKey(templateId));
  notifyGuestRunReaders();
};
