import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { renderDevVars } from '../../../scripts/setup-local-lib.mjs';

const example = readFileSync(path.join(process.cwd(), '.dev.vars.example'), 'utf8');
const SECRET = 'a'.repeat(48);

describe('renderDevVars', () => {
  it('fills in the auth secret and comments out placeholder integrations', () => {
    const lines = renderDevVars(example, SECRET).split('\n');

    expect(lines).toContain(`BETTER_AUTH_SECRET=${SECRET}`);
    expect(lines).toContain('# RESEND_API_KEY=re_xxx');
    expect(lines).toContain('# STRIPE_SECRET_KEY=sk_test_xxx');
    expect(lines).toContain('FRONTEND_URL=http://localhost:8080');
  });

  it('gives a CRLF checkout of .dev.vars.example the same result', () => {
    const crlf = example.replace(/\r?\n/g, '\r\n');

    expect(renderDevVars(crlf, SECRET)).toBe(renderDevVars(example, SECRET));
    expect(renderDevVars(crlf, SECRET).split('\n')).toContain(`BETTER_AUTH_SECRET=${SECRET}`);
  });
});
