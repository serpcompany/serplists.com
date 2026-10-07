import { describe, expect, it } from 'vitest';
import { describeFrontendUrlProblem, describeOriginListProblem } from '@functions/api/utils/origin-list';
import { parseEnvFile } from '../../../scripts/lib/env-file';
import { readWranglerToml } from '../../support/wranglerToml';

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
      const problem = name === 'FRONTEND_URL' ? describeFrontendUrlProblem(value) : describeOriginListProblem(value);
      expect(problem, `${name}=${value}`).toBeNull();
    }
  });
});
