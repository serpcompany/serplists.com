import { toggleDocumentTheme, useDocumentTheme } from '@/lib/theme';

// The theme switch's state and labels, for the header button and the sidebar's menu button.
// The server cannot read the stored theme: its render says light (the icons follow the
// page's class through CSS already), and the labels follow the page's theme after
// hydration, and every change after that, from this tab or another.
export function useThemeToggle() {
  const isDark = useDocumentTheme() === 'dark';
  return {
    accessibleLabel: isDark ? 'Switch to light mode' : 'Switch to dark mode',
    label: isDark ? 'Dark mode' : 'Light mode',
    toggle: () => toggleDocumentTheme(),
  };
}
