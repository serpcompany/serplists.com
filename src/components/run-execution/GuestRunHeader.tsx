import type { ReactNode } from 'react';
import { Trash2 } from 'lucide-react';

import { DashboardPageHeader } from '@/components/dashboard/DashboardContentShell';
import { RunStatusMeta } from '@/components/run-execution/RunStatusMeta';
import { Button } from '@/components/ui/button';

type GuestRunHeaderProps = {
  accountAction: ReactNode;
  description: string;
  finishRunButton: ReactNode;
  isCompleted: boolean;
  onDelete: () => void;
  progress: number;
  savePrompt: ReactNode;
  title: string;
};

export function GuestRunHeader({
  accountAction,
  description,
  finishRunButton,
  isCompleted,
  onDelete,
  progress,
  savePrompt,
  title,
}: GuestRunHeaderProps) {
  return (
    <DashboardPageHeader
      title={title}
      description={
        <>
          {description}
          <span className="block">
            This run is saved in this browser only.{savePrompt ? <> {savePrompt}</> : null}
          </span>
        </>
      }
      meta={<RunStatusMeta isCompleted={isCompleted} progress={progress} />}
      actions={
        <>
          {accountAction}
          {finishRunButton}
          <Button variant="outline" onClick={onDelete}>
            <Trash2 data-icon="inline-start" />
            Delete run
          </Button>
        </>
      }
    />
  );
}
