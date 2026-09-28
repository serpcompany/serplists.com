import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(__dirname, '../../../src');

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });

const importsOf = (file: string): string[] =>
  [...readFileSync(file, 'utf8').matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);

// App.tsx mounts only the sonner Toaster. A toast sent through any other store is
// never rendered, so a failed upload would give the user no feedback at all.
describe('toast rendering', () => {
  it('mounts the sonner Toaster in the app shell', () => {
    const app = readFileSync(path.join(SRC, 'App.tsx'), 'utf8');
    expect(app).toMatch(/import \{ Toaster \} from '@\/components\/ui\/sonner'/);
    expect(app).toContain('<Toaster />');
  });

  it('sends every toast through sonner, never through a store with no mounted renderer', () => {
    const offenders = sourceFiles(SRC).flatMap((file) =>
      importsOf(file)
        .filter((specifier) => /(^|\/)use-toast$|(^|\/)ui\/toaster$|^\.\/toaster$|@radix-ui\/react-toast/.test(specifier))
        .map((specifier) => `${path.relative(SRC, file).split(path.sep).join("/")} imports ${specifier}`),
    );

    expect(offenders).toEqual([]);
  });
});
