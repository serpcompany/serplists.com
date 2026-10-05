import type { ReactNode } from 'react';
import { Trash2 } from 'lucide-react';

import { DashboardPageHeader } from '@/components/dashboard/DashboardContentShell';
import { RunStatusMeta } from '@/components/run-execution/RunStatusMeta';
import { Button } from '@/components/ui/button';

type GuestRunHeaderProps = {
  description: string;
  finishRunButton: ReactNode;
  isCompleted: boolean;
  onDelete: () => void;
  progress: number;
  title: string;
};

export function GuestRunHeader({
  description,
  finishRunButton,
  isCompleted,
  onDelete,
  progress,
  title,
}: GuestRunHeaderProps) {
  return (
    <DashboardPageHeader
      title={title}
      description={
        <>
          {description}
          <span className="block">This run is saved in this browser only.</span>
        </>
      }
      meta={<RunStatusMeta isCompleted={isCompleted} progress={progress} />}
      actions={
        <>
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
