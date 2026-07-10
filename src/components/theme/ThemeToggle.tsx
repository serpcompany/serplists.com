import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  applyStoredTheme,
  getStoredTheme,
  THEME_CHANGE_EVENT,
  toggleDocumentTheme,
  type SerpListsTheme,
} from '@/lib/theme';
import { cn } from '@/lib/utils';

interface ThemeToggleProps {
  className?: string;
  showLabel?: boolean;
}

export function ThemeToggle({ className, showLabel = false }: ThemeToggleProps) {
  const [theme, setTheme] = useState<SerpListsTheme>(() => getStoredTheme());

  useEffect(() => {
    setTheme(applyStoredTheme());

    const handleThemeChange = (event: Event) => {
      const nextTheme =
        event instanceof CustomEvent && event.detail
          ? event.detail
          : getStoredTheme();
      setTheme(nextTheme);
    };

    window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange);
    window.addEventListener('storage', handleThemeChange);

    return () => {
      window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange);
      window.removeEventListener('storage', handleThemeChange);
    };
  }, []);

  const isDark = theme === 'dark';
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
      onClick={() => setTheme(toggleDocumentTheme())}
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
