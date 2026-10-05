import type { ReactNode } from 'react';
import { ArrowLeft, Edit2 } from 'lucide-react';

import { DashboardPageHeader } from '@/components/dashboard/DashboardContentShell';
import { RunShareActions } from '@/components/run-execution/RunShareActions';
import { RunStatusMeta } from '@/components/run-execution/RunStatusMeta';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import type { RunExecutionActionResult } from '@/features/run-execution/useRunExecutionModel';
import { RUN_TITLE_MAX } from '@/lib/schemas/nameLimits';
import { onSingleClick } from '@/lib/utils/repeatClick';

type RunPageHeaderProps = {
  canUpdateRun: boolean;
  description: string;
  editTitle: string;
  finishRunButton: ReactNode;
  isCompleted: boolean;
  isCreatingShare: boolean;
  isEditingTitle: boolean;
  isPublic: boolean;
  onBack: () => void;
  onCancelRename: () => void;
  onEditTitleChange: (title: string) => void;
  onSaveTitle: () => void;
  onShare: () => void;
  onStartRename: () => void;
  onStopSharing: () => Promise<RunExecutionActionResult>;
  progress: number;
  roleUnavailable: boolean;
  title: string;
  titleChanged: boolean;
};

export function RunPageHeader({
  canUpdateRun,
  description,
  editTitle,
  finishRunButton,
  isCompleted,
  isCreatingShare,
  isEditingTitle,
  isPublic,
  onBack,
  onCancelRename,
  onEditTitleChange,
  onSaveTitle,
  onShare,
  onStartRename,
  onStopSharing,
  progress,
  roleUnavailable,
  title,
  titleChanged,
}: RunPageHeaderProps) {
  return (
    <DashboardPageHeader
      title={title}
      titleEditor={
        isEditingTitle ? (
          <Field className="max-w-md">
            <FieldLabel htmlFor="run-title">Run title</FieldLabel>
            <Input
              aria-label="Run title"
              id="run-title"
              maxLength={RUN_TITLE_MAX}
              value={editTitle}
              onChange={(event) => onEditTitleChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  onSaveTitle();
                }
                if (event.key === 'Escape') {
                  onCancelRename();
                }
              }}
              autoFocus
            />
          </Field>
        ) : undefined
      }
      description={description}
      meta={
        <RunStatusMeta isCompleted={isCompleted} progress={progress}>
          {canUpdateRun || roleUnavailable ? null : <Badge variant="secondary">View only</Badge>}
        </RunStatusMeta>
      }
      actions={
        <>
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft data-icon="inline-start" />
            Runs
          </Button>
          {!canUpdateRun ? null : !isEditingTitle ? (
            <Button variant="outline" onClick={onSingleClick(onStartRename)}>
              <Edit2 data-icon="inline-start" />
              Rename
            </Button>
          ) : (
            <>
              <Button disabled={!titleChanged} onClick={onSingleClick(onSaveTitle)}>
                Save title
              </Button>
              <Button variant="outline" onClick={onSingleClick(onCancelRename)}>
                Cancel
              </Button>
            </>
          )}
          {finishRunButton}
          {canUpdateRun ? (
            <RunShareActions
              isCreatingShare={isCreatingShare}
              isPublic={isPublic}
              onShare={onShare}
              onStopSharing={onStopSharing}
            />
          ) : null}
        </>
      }
    />
  );
}
