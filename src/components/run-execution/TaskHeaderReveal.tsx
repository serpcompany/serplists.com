import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import { createTaskRevealer } from '@/features/run-execution/taskReveal';
import { cn } from '@/lib/utils';
import { ignoreRepeatClicksBriefly } from '@/lib/utils/repeatClick';

// Scroll before the browser paints, so the new task never shows at the old position. Layout
// effects do nothing on the server (React 18 warns there), so static rendering uses an effect.
const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

interface TaskHeaderRevealProps {
  children: ReactNode;
  className?: string;
  taskId: string;
}

// The header of the task shown in the run page's panel. The panel stays mounted while the
// task inside it changes, so when taskId changes this scrolls the header into view and
// focuses the task title, its one h2 (which needs tabIndex={-1}). See taskReveal.ts.
//
// The scroll margin keeps the header below the console's sticky 3.5rem top bar (AppShell.tsx).
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
        // The page moved under the pointer: the rest of a double click on Mark Complete or
        // Next must not land on whatever is there now.
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
