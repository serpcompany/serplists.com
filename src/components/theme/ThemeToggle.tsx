import { Moon, Sun } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { toggleDocumentTheme, useDocumentTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';

interface ThemeToggleProps {
  className?: string;
  showLabel?: boolean;
}

export function ThemeToggle({ className, showLabel = false }: ThemeToggleProps) {
  // The server cannot read the stored theme: its render says light (the icons follow the
  // page's class through CSS already), and the label follows the page's theme after
  // hydration, and every change after that, from this tab or another.
  const isDark = useDocumentTheme() === 'dark';
  const accessibleLabel = isDark ? 'Switch to light mode' : 'Switch to dark mode';

  return (
    <Button
      variant="ghost"
      size={showLabel ? 'sm' : 'icon'}
      className={cn(
        'text-muted-foreground hover:text-foreground',
        showLabel ? 'w-full justify-start gap-2' : 'relative h-9 w-9',
        className,
      )}
      type="button"
      aria-label={accessibleLabel}
      onClick={() => toggleDocumentTheme()}
    >
      <span className="relative h-4 w-4">
        <Sun className="absolute h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
        <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      </span>
      {showLabel ? (
        <span>{isDark ? 'Dark mode' : 'Light mode'}</span>
      ) : (
        <span className="sr-only">{accessibleLabel}</span>
      )}
    </Button>
  );
}
