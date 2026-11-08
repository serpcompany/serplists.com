import { vi } from 'vitest';

import type { RunPageHeader } from '@/components/run-execution/RunPageHeader';

export type RunPageHeaderProps = Parameters<typeof RunPageHeader>[0];

export const runPageHeaderProps = (overrides: Partial<RunPageHeaderProps> = {}): RunPageHeaderProps => ({
  answersExport: null,
  canUpdateRun: true,
  description: '2 of 3 tasks finished',
  editTitle: 'Launch',
  finishRunButton: null,
  isCompleted: false,
  isCreatingShare: false,
  isEditingTitle: false,
  isPublic: false,
  onBack: vi.fn(),
  onCancelRename: vi.fn(),
  onEditTitleChange: vi.fn(),
  onSaveTitle: vi.fn(),
  onShare: vi.fn(),
  onStartRename: vi.fn(),
  onStopSharing: vi.fn(async () => ({ kind: 'ok' as const })),
  progress: 66,
  title: 'Launch',
  titleChanged: true,
  ...overrides,
});
