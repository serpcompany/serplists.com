import { toggleDocumentTheme, useDocumentTheme } from '@/lib/theme';

export function useThemeToggle() {
  const isDark = useDocumentTheme() === 'dark';
  return {
    accessibleLabel: isDark ? 'Switch to light mode' : 'Switch to dark mode',
    label: isDark ? 'Dark mode' : 'Light mode',
    toggle: () => toggleDocumentTheme(),
  };
}
