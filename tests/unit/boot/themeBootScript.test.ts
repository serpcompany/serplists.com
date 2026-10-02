import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

import { THEME_STORAGE_KEY } from '@/lib/theme';
import { THEME_BOOT_SCRIPT } from '@/lib/themeBootScript';

function runThemeScript(storedThemeOrReadError: string | null | Error): { dark: boolean; keysRead: string[] } {
  const classes = new Set<string>();
  const keysRead: string[] = [];
  const localStorage = {
    getItem(key: string) {
      keysRead.push(key);
      if (storedThemeOrReadError instanceof Error) throw storedThemeOrReadError;
      return storedThemeOrReadError;
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

const globalsCss = readFileSync('src/app/globals.css', 'utf8');

const oklchLightnessInTheDarkBlock = (name: string): number => {
  const body = /\.dark\s*\{([^}]*)\}/.exec(globalsCss)?.[1] ?? '';
  return Number(new RegExp(`--${name}:\\s*oklch\\(([\\d.]+) 0 0\\)`).exec(body)?.[1]);
};

describe('theme boot script, which makes a dark-theme page dark from its first paint', () => {
  it('reads the theme from the key the app stores it under', () => {
    expect(runThemeScript('dark')).toEqual({ dark: true, keysRead: [THEME_STORAGE_KEY] });
  });

  it('marks <html> dark only for a stored dark theme', () => {
    expect(runThemeScript('light').dark).toBe(false);
    expect(runThemeScript(null).dark).toBe(false);
    expect(runThemeScript('DARK').dark).toBe(false);
    expect(runThemeScript(new Error('storage blocked')).dark).toBe(false);
  });

  it("runs from the root layout head while the page is parsed, before the first paint, not through next/script, which waits for Next.js's runtime", () => {
    const layout = readFileSync('src/app/layout.tsx', 'utf8');
    const head = /<head>([\s\S]*?)<\/head>/.exec(layout)?.[1] ?? '';

    expect(head).toMatch(/<script dangerouslySetInnerHTML=\{\{ __html: THEME_BOOT_SCRIPT \}\} \/>/);
    expect(layout).not.toMatch(/<Script[^>]*>\s*\{THEME_BOOT_SCRIPT\}/);
  });

  it('paints the page background from the theme tokens, dark under html.dark', () => {
    expect(globalsCss).toMatch(/body\s*\{\s*@apply bg-background text-foreground/);
    expect(oklchLightnessInTheDarkBlock('background')).toBeLessThan(0.15);
    expect(oklchLightnessInTheDarkBlock('foreground')).toBeGreaterThan(0.9);
  });

  it('never darkens the page for the operating system setting, since the app has no system theme', () => {
    expect(globalsCss).not.toContain('prefers-color-scheme');
  });
});
