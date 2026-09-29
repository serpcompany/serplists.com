import { Moon, Sun } from 'lucide-react';

import { useThemeToggle } from '@/components/theme/useThemeToggle';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// The sun in light mode and the moon in dark mode, from the page's class.
export function ThemeIcon() {
  return (
    <span className="relative size-4" aria-hidden="true">
      <Sun className="absolute size-4 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
      <Moon className="absolute size-4 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
    </span>
  );
}

interface ThemeToggleProps {
  className?: string;
  showLabel?: boolean;
}

export function ThemeToggle({ className, showLabel = false }: ThemeToggleProps) {
  const { accessibleLabel, label, toggle } = useThemeToggle();

  return (
    <Button
      variant={showLabel ? 'ghost' : 'outline'}
      size={showLabel ? 'default' : 'icon'}
      className={cn(showLabel && 'w-full justify-start', className)}
      type="button"
      aria-label={accessibleLabel}
      onClick={toggle}
    >
      <ThemeIcon />
      {showLabel ? <span>{label}</span> : <span className="sr-only">{accessibleLabel}</span>}
    </Button>
  );
}
