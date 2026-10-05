import type { ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

export function RunStatusMeta({
  children,
  isCompleted,
  progress,
}: {
  children?: ReactNode;
  isCompleted: boolean;
  progress: number;
}) {
  return (
    <>
      <Badge variant={isCompleted ? 'default' : 'secondary'}>
        {isCompleted ? 'Completed' : 'In Progress'}
      </Badge>
      {children}
      <div className="hidden w-32 items-center gap-2 xl:flex">
        <Progress aria-label="Run progress" className="flex-1" value={progress} />
        <span className="text-xs font-medium tabular-nums">{progress}%</span>
      </div>
    </>
  );
}
