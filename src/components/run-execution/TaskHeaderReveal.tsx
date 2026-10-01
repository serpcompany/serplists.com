import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import { createTaskRevealer } from '@/features/run-execution/taskReveal';
import { cn } from '@/lib/utils';
import { ignoreRepeatClicksBriefly } from '@/lib/utils/repeatClick';

const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

interface TaskHeaderRevealProps {
  children: ReactNode;
  className?: string;
  taskId: string;
}

export function TaskHeaderReveal({ children, className, taskId }: TaskHeaderRevealProps) {
  const headerRef = useRef<HTMLDivElement>(null);
  const [reveal] = useState(createTaskRevealer);

  useBrowserLayoutEffect(() => {
    reveal(taskId, () => {
      const header = headerRef.current;
      const title = header?.querySelector<HTMLElement>('h2');
      if (!header || !title) return null;
      return {
        activeElement: document.activeElement instanceof HTMLElement ? document.activeElement : null,
        header,
        onScrolled: () => ignoreRepeatClicksBriefly(window),
        stickyOffset: Number.parseFloat(window.getComputedStyle(header).scrollMarginTop) || 0,
        title,
        viewportHeight: window.innerHeight,
      };
    });
  }, [reveal, taskId]);

  return (
    <div className={cn('scroll-mt-14', className)} ref={headerRef}>
      {children}
    </div>
  );
}
