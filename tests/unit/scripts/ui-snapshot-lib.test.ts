import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { parseUiSnapArgs } from '../../../scripts/ui-snapshot-lib';

const route = 'dashboard/templates';
const mobile = ['--mobile'];
const login = ['--login', 'john@test.com'];

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, index) =>
    permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [item, ...rest]),
  );
}

describe('parseUiSnapArgs', () => {
  for (const order of permutations([[route], mobile, login])) {
    const argv = order.flat();

    it(`reads the route and flags from ${argv.join(' ')}`, () => {
      expect(parseUiSnapArgs(argv)).toMatchObject({
        routePath: '/dashboard/templates',
        slug: 'dashboard-templates',
        outPath: path.join('tmp', 'snapshots', 'dashboard-templates.png'),
        mobile: true,
        login: 'john@test.com',
      });
    });
  }

  it('ignores the -- that pnpm passes through, after which parseArgs would read every flag as a route', () => {
    expect(parseUiSnapArgs(['--', 'templates', '--login', 'x@test.com'])).toMatchObject({
      routePath: '/templates',
      login: 'x@test.com',
      mobile: false,
    });
  });

  it('accepts --flag=value and keeps a leading slash or query', () => {
    expect(parseUiSnapArgs(['--out=tmp/x.png', '--login=a@b.c', '/templates?tab=public'])).toMatchObject({
      routePath: '/templates?tab=public',
      outPath: 'tmp/x.png',
      login: 'a@b.c',
    });
  });

  it('snapshots the home page when no route is given', () => {
    expect(parseUiSnapArgs([])).toEqual({
      routePath: '/',
      slug: 'home',
      outPath: path.join('tmp', 'snapshots', 'home.png'),
      ariaPath: path.join('tmp', 'snapshots', 'home.aria.yml'),
      mobile: false,
      login: undefined,
      password: undefined,
      base: undefined,
      api: undefined,
    });
  });

  it('rejects a second route', () => {
    expect(() => parseUiSnapArgs(['dashboard', 'templates'])).toThrow(/one route/);
  });

  it('rejects an unknown flag', () => {
    expect(() => parseUiSnapArgs(['--moble', 'dashboard'])).toThrow(/--moble/);
  });

  it('rejects a flag with no value', () => {
    expect(() => parseUiSnapArgs(['dashboard', '--login'])).toThrow(/--login/);
    expect(() => parseUiSnapArgs(['dashboard', '--login', '--mobile'])).toThrow(/--login/);
  });
});

describe('ui:snap output paths', () => {
  const ariaFor = (out: string) => parseUiSnapArgs(['dashboard', '--out', out]).ariaPath;

  it('writes the accessibility YAML beside the default screenshot', () => {
    expect(parseUiSnapArgs(['dashboard'])).toMatchObject({
      outPath: path.join('tmp', 'snapshots', 'dashboard.png'),
      ariaPath: path.join('tmp', 'snapshots', 'dashboard.aria.yml'),
    });
  });

  for (const extension of ['png', 'jpg', 'jpeg', 'jpe']) {
    it(`never writes the YAML over a .${extension} screenshot, which Playwright saves as an image`, () => {
      const out = path.join('tmp', 'snapshots', `dash.${extension}`);
      const { outPath, ariaPath } = parseUiSnapArgs(['dashboard', '--out', out]);
      expect(outPath).toBe(out);
      expect(ariaPath).toBe(path.join('tmp', 'snapshots', 'dash.aria.yml'));
      expect(path.resolve(ariaPath)).not.toBe(path.resolve(outPath));
    });
  }

  it('keeps dots in the directory and the file name', () => {
    expect(ariaFor(path.join('tmp', 'v1.2', 'shot.jpg'))).toBe(path.join('tmp', 'v1.2', 'shot.aria.yml'));
    expect(ariaFor('dash.v2.png')).toBe('dash.v2.aria.yml');
  });

  it('rejects an --out that Playwright cannot save as an image, whose extension it reads case-sensitively', () => {
    for (const out of ['tmp/x.gif', 'tmp/x', 'tmp/x.PNG', 'tmp/x.JPG', 'tmp/x.aria.yml', 'tmp/x.webp']) {
      expect(() => parseUiSnapArgs(['dashboard', '--out', out]), out).toThrow(/--out/);
    }
  });
});
