import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { withLocalApiStandIn } from './localApiStandIn';
import { processEnvWithout, runScriptProcess, type ScriptProcessRun } from './scriptProcess';

export type StripeCall = { method: string; path: string; query: URLSearchParams; form: URLSearchParams; secretKey: string };
export type StripeAnswer = { status: number; body: unknown };
export type StripeRoute = (call: StripeCall) => StripeAnswer | undefined;

type StripeScriptRun = ScriptProcessRun & { calls: StripeCall[]; devVars: string | null };

const NO_SUCH_ROUTE: StripeAnswer = { status: 404, body: { error: { message: 'Unrecognized request URL' } } };

export const stripeList = (data: unknown[]): StripeAnswer => ({ status: 200, body: { object: 'list', data } });

export async function runStripeScript(
  script: string,
  { args = [], devVars, env = {}, route = () => undefined }: {
    args?: string[];
    devVars?: string;
    env?: Record<string, string>;
    route?: StripeRoute;
  } = {},
): Promise<StripeScriptRun> {
  const dir = mkdtempSync(path.join(tmpdir(), 'serplists-stripe-script-'));
  const devVarsPath = path.join(dir, '.dev.vars');
  if (devVars !== undefined) writeFileSync(devVarsPath, devVars);
  const calls: StripeCall[] = [];
  try {
    const run = await withLocalApiStandIn(
      (request) => {
        const call = {
          method: request.method,
          path: request.url.pathname,
          query: request.url.searchParams,
          form: new URLSearchParams(request.body),
          secretKey: (request.headers.authorization ?? '').replace(/^Bearer /, ''),
        };
        calls.push(call);
        return route(call) ?? NO_SUCH_ROUTE;
      },
      (origin) =>
        runScriptProcess(script, {
          args,
          cwd: dir,
          env: { ...processEnvWithout(['STRIPE_']), ...env, STRIPE_API_STAND_IN: origin },
          preloads: ['tests/support/stripeApiRedirect.ts'],
        }),
    );
    return { ...run, calls, devVars: existsSync(devVarsPath) ? readFileSync(devVarsPath, 'utf8') : null };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
