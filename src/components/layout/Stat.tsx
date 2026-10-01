import type { ReactNode } from 'react';

import { IconTile } from '@/components/layout/IconTile';
import { cn } from '@/lib/utils';

type StatProps = {
  className?: string;
  icon?: ReactNode;
  label: ReactNode;
  value: ReactNode;
};

export function Stat({ className, icon, label, value }: StatProps) {
  return (
    <div className={cn('flex flex-col gap-3', className)} data-slot="stat">
      {icon ? (
        <IconTile size="sm" tone="card">
          {icon}
        </IconTile>
      ) : null}
      <div>
        <p className="text-2xl font-semibold capitalize tabular-nums">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
