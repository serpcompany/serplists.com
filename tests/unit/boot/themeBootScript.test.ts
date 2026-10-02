import '../../support/mockedNextNavigation';
import vm from 'node:vm';
import type { Declaration, Result } from 'postcss';
import { beforeAll, describe, expect, it } from 'vitest';

import { THEME_STORAGE_KEY } from '@/lib/theme';
import { THEME_BOOT_SCRIPT } from '@/lib/themeBootScript';

import { compileTheStylesheetTheRootLayoutImports } from '../../support/appStylesheet';
import { plainScriptsInTheHead, rootLayoutOn } from '../../support/rootLayout';

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

let stylesheet: Result;

beforeAll(async () => {
  stylesheet = await compileTheStylesheetTheRootLayoutImports();
}, 120_000);

const declarationsOf = (selector: string): Record<string, string> => {
  const declarations: Record<string, string> = {};
  stylesheet.root.walkRules((rule) => {
    if (rule.selector !== selector) return;
    rule.walkDecls((declaration: Declaration) => {
      declarations[declaration.prop] = declaration.value;
    });
  });
  return declarations;
};

const oklchLightnessInTheDarkTheme = (token: string): number =>
  Number(/^oklch\(([\d.]+) /.exec(declarationsOf('.dark')[`--${token}`] ?? '')?.[1]);

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

  it("runs from the root layout head while the page is parsed, before the first paint, not through next/script, which waits for Next.js's runtime", async () => {
    for (const siteEnv of ['production', 'staging', undefined]) {
      expect(plainScriptsInTheHead(await rootLayoutOn(siteEnv))[0], String(siteEnv)).toBe(THEME_BOOT_SCRIPT);
    }
  });

  it('paints the page background from the theme tokens, dark under html.dark', () => {
    expect(declarationsOf('body')).toMatchObject({ 'background-color': 'var(--background)', color: 'var(--foreground)' });
    expect(oklchLightnessInTheDarkTheme('background')).toBeLessThan(0.15);
    expect(oklchLightnessInTheDarkTheme('foreground')).toBeGreaterThan(0.9);
  });

  it('never darkens the page for the operating system setting, since the app has no system theme', () => {
    const colorSchemeQueries: string[] = [];
    stylesheet.root.walkAtRules('media', (rule) => {
      if (rule.params.includes('prefers-color-scheme')) colorSchemeQueries.push(rule.params);
    });

    expect(stylesheet.css).toContain('.dark');
    expect(colorSchemeQueries).toEqual([]);
  });
});
