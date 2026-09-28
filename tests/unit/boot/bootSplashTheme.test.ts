import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

import { THEME_STORAGE_KEY } from '@/lib/theme';

// index.html's inline script adds `dark` to <html> before the first paint, but the boot
// splash that covers the screen until the app mounts was always white. A dark-theme user
// saw a white screen for the whole bundle load on every page load, then the app flipped
// to dark. The splash now follows the class, with the app's dark tokens.

const indexHtml = readFileSync('index.html', 'utf8');
const indexCss = readFileSync('src/index.css', 'utf8');

const inlineScripts = [...indexHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
const themeScript = inlineScripts.find((script) => script.includes('classList'));
const inlineStyle = /<style>([\s\S]*?)<\/style>/.exec(indexHtml)?.[1] ?? '';

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
  vm.runInNewContext(themeScript!, {
    window: { localStorage },
    document: {
      documentElement: {
        classList: { add: (name: string) => classes.add(name), remove: (name: string) => classes.delete(name) },
      },
    },
  });
  return { dark: classes.has('dark'), keysRead };
}

type Rule = { selectors: string[]; declarations: Map<string, string>; order: number };

const rules: Rule[] = inlineStyle
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/@keyframes[^{]*\{(?:[^{}]*\{[^}]*\})*[^}]*\}/g, '')
  .split('}')
  .map((chunk) => chunk.split('{'))
  .filter((parts) => parts.length === 2)
  .map(([selectorText, body], order) => ({
    selectors: selectorText.split(',').map((selector) => selector.trim().replace(/\s+/g, ' ')),
    declarations: new Map(
      body
        .split(';')
        .map((declaration) => declaration.split(':').map((part) => part.trim()))
        .filter((parts) => parts.length >= 2 && parts[0])
        .map(([property, ...value]) => [property, value.join(':')]),
    ),
    order,
  }));

// The selectors the splash uses, with their specificity (ids, classes, types).
const SELECTORS: Record<string, { dark: boolean; specificity: number; target: string }> = {
  '#boot-splash': { dark: false, specificity: 100, target: 'splash' },
  'html.dark #boot-splash': { dark: true, specificity: 111, target: 'splash' },
  '#boot-spinner': { dark: false, specificity: 100, target: 'spinner' },
  'html.dark #boot-spinner': { dark: true, specificity: 111, target: 'spinner' },
  html: { dark: false, specificity: 1, target: 'html' },
  'html.dark': { dark: true, specificity: 11, target: 'html' },
};

/** The winning value of `property` on the splash, spinner or <html>, as the cascade picks it. */
function computed(target: string, property: string, dark: boolean): string | undefined {
  const candidates = rules.flatMap((rule) =>
    rule.selectors.flatMap((selector) => {
      const known = SELECTORS[selector];
      if (!known || known.target !== target || (known.dark && !dark) || !rule.declarations.has(property)) return [];
      return [{ value: rule.declarations.get(property)!, specificity: known.specificity, order: rule.order }];
    }),
  );
  candidates.sort((left, right) => left.specificity - right.specificity || left.order - right.order);
  return candidates.at(-1)?.value;
}

const luminance = (hex: string | undefined): number => {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex ?? '');
  if (!match) throw new Error(`Expected a #rrggbb color, got ${hex}`);
  const [r, g, b] = match.slice(1).map((channel) => {
    const value = parseInt(channel, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** The sRGB channel (0-255) of a gray oklch(L 0 0) token in src/index.css. */
const darkToken = (name: string): number => {
  const darkBlock = /\.dark\s*\{([^}]*)\}/.exec(indexCss)?.[1] ?? '';
  const lightness = Number(new RegExp(`--${name}:\\s*oklch\\(([\\d.]+) 0 0\\)`).exec(darkBlock)?.[1]);
  const linear = lightness ** 3;
  const srgb = linear <= 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055;
  return Math.round(srgb * 255);
};

describe('boot splash theme', () => {
  it('reads the theme from the key the app stores it under', () => {
    expect(themeScript).toBeDefined();
    expect(runThemeScript('dark')).toEqual({ dark: true, keysRead: [THEME_STORAGE_KEY] });
  });

  it('marks <html> dark only for a stored dark theme', () => {
    expect(runThemeScript('light').dark).toBe(false);
    expect(runThemeScript(null).dark).toBe(false);
    expect(runThemeScript('DARK').dark).toBe(false);
    expect(runThemeScript(new Error('storage blocked')).dark).toBe(false);
  });

  it('paints the splash dark, with light text and spinner, when <html> is dark', () => {
    const background = computed('splash', 'background', true);
    expect(luminance(background)).toBeLessThan(0.02);
    expect(luminance(computed('splash', 'color', true))).toBeGreaterThan(0.8);
    expect(computed('spinner', 'border-top-color', true)).toMatch(/rgba\(\s*250,\s*250,\s*250/);
    expect(computed('html', 'color-scheme', true)).toBe('dark');
    expect(luminance(computed('html', 'background', true))).toBeLessThan(0.02);
  });

  it('matches the dark background and foreground tokens in src/index.css', () => {
    const channel = (hex: string | undefined) => parseInt((hex ?? '').slice(1, 3), 16);

    expect(Math.abs(channel(computed('splash', 'background', true)) - darkToken('background'))).toBeLessThanOrEqual(2);
    expect(Math.abs(channel(computed('splash', 'color', true)) - darkToken('foreground'))).toBeLessThanOrEqual(2);
  });

  it('keeps the light splash for everyone else', () => {
    expect(computed('splash', 'background', false)).toBe('#ffffff');
    expect(computed('splash', 'color', false)).toBe('#111827');
    // The app has no system theme, so the OS setting must not darken the splash.
    expect(inlineStyle).not.toContain('prefers-color-scheme');
  });
});
