import { describe, expect, it } from 'vitest';
import * as runtime from '@functions/api/utils/origin-list';
import { parseEnvFile } from '../../../scripts/lib/env-file.mjs';
import * as script from '../../../scripts/lib/origin-list.mjs';
import { readWranglerToml } from '../../support/wranglerToml';

const VALUES = [
  '',
  ' ',
  ',',
  ' , ',
  '*',
  'null',
  'serplists.com',
  '*.serplists.com',
  'https://*.serplists.com',
  'localhost:8080',
  'serplists.com:443',
  'https//serplists.com',
  'file:///index.html',
  'ftp://serplists.com',
  'http://user:pw@serplists.com',
  'https://serplists.com',
  'https://serplists.com/',
  'https://serplists.com/app?x=1#y',
  'HTTPS://SERPLISTS.COM',
  'http://localhost:8080',
  'http://127.0.0.1:4173',
  'http://[::1]:8788',
  'https://ok.com,bad',
  'https://ok.com, localhost:8080',
  'http://localhost:8080, https://serplists.com/,',
];

describe('the plain-JS origin list check-env.mjs runs without a TypeScript loader', () => {
  it.each(VALUES)('parses %j as the API does', (value) => {
    expect(script.parseAllowedOrigin(value)).toBe(runtime.parseAllowedOrigin(value));
    expect(script.parseOriginList(value)).toEqual(runtime.parseOriginList(value));
    expect(script.describeOriginListProblem(value)).toBe(runtime.describeOriginListProblem(value));
    expect(script.describeFrontendUrlProblem(value)).toBe(runtime.describeFrontendUrlProblem(value));
  });
});

const ORIGIN_SETTINGS = ['FRONTEND_URL', 'CORS_ALLOWED_ORIGINS'];

function originSettings(vars: Record<string, string>): Array<[string, string]> {
  return Object.entries(vars).filter(([name]) => ORIGIN_SETTINGS.includes(name));
}

describe('committed origin values', () => {
  it('are all valid in wrangler.toml and .dev.vars.example', () => {
    const wrangler = readWranglerToml();
    const values = [
      ...[wrangler.vars, wrangler.env.preview.vars, wrangler.env.production.vars].flatMap(originSettings),
      ...originSettings(parseEnvFile('.dev.vars.example')),
    ];
    expect(values.map(([name]) => name)).toEqual(expect.arrayContaining(ORIGIN_SETTINGS));

    for (const [name, value] of values) {
      const problem =
        name === 'FRONTEND_URL' ? runtime.describeFrontendUrlProblem(value) : runtime.describeOriginListProblem(value);
      expect(problem, `${name}=${value}`).toBeNull();
    }
  });
});
