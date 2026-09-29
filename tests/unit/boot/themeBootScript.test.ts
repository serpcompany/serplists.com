import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

import { THEME_STORAGE_KEY } from '@/lib/theme';
import { THEME_BOOT_SCRIPT } from '@/lib/themeBootScript';

// The page must be dark from its first paint for a user who chose the dark theme: a white
// screen until the app loaded, then a flip to dark, was a bug (the boot splash was always
// white). The server sends each page's HTML; the root layout's theme script marks <html>
// dark before the page paints, and the page's own background follows the class.

/** Runs the pre-paint theme script and returns whether <html> ended up with `dark`. */
function runThemeScript(stored: string | null | Error): { dark: boolean; keysRead: string[] } {
  const classes = new Set<string>();
  const keysRead: string[] = [];
  const localStorage = {
    getItem(key: string) {
      keysRead.push(key);
      if (stored instanceof Error) throw stored;
      return stored;
    },
  };
  vm.runInNewContext(THEME_BOOT_SCRIPT, {
    window: { localStorage },
    document: {
      documentElement: {
        classList: { add: (name: string) => classes.add(name), remove: (name: string) => classes.delete(name) },
      },
    },
  });
  return { dark: classes.has('dark'), keysRead };
}

const indexCss = readFileSync('src/index.css', 'utf8');

/** The lightness of an oklch(L 0 0) token in the `.dark` block of src/index.css. */
const darkTokenLightness = (name: string): number => {
  const body = /\.dark\s*\{([^}]*)\}/.exec(indexCss)?.[1] ?? '';
  return Number(new RegExp(`--${name}:\\s*oklch\\(([\\d.]+) 0 0\\)`).exec(body)?.[1]);
};

describe('theme boot script', () => {
  it('reads the theme from the key the app stores it under', () => {
    expect(runThemeScript('dark')).toEqual({ dark: true, keysRead: [THEME_STORAGE_KEY] });
  });

  it('marks <html> dark only for a stored dark theme', () => {
    expect(runThemeScript('light').dark).toBe(false);
    expect(runThemeScript(null).dark).toBe(false);
    expect(runThemeScript('DARK').dark).toBe(false);
    expect(runThemeScript(new Error('storage blocked')).dark).toBe(false);
  });

  it('runs from the root layout before the page is interactive', () => {
    const layout = readFileSync('src/app/layout.tsx', 'utf8');

    expect(layout).toMatch(/<Script id="theme-boot" strategy="beforeInteractive">\s*\{THEME_BOOT_SCRIPT\}/);
  });

  it('paints the page background from the theme tokens, dark under html.dark', () => {
    expect(indexCss).toMatch(/body\s*\{\s*@apply bg-background text-foreground/);
    expect(darkTokenLightness('background')).toBeLessThan(0.15);
    expect(darkTokenLightness('foreground')).toBeGreaterThan(0.9);
    // The app has no system theme, so the OS setting must not darken the page.
    expect(indexCss).not.toContain('prefers-color-scheme');
  });
});
