import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export function Toolbar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn('flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end', className)}
      data-slot="toolbar"
    >
      {children}
    </div>
  );
}
