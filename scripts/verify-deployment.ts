import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { z } from "zod";

import { SMOKE_TEST_HEADER } from "../src/lib/seo/siteOrigin";

export const SIGN_IN_PATH = "/api/auth/sign-in/email";
const RELEASE_PAGE = "/about/";
const RELEASE_META_TAG = /<meta\b[^>]*\bname=["']serplists-release["'][^>]*>/i;
const CONTENT_ATTRIBUTE = /\bcontent=["']([^"']*)["']/i;

type ProbeInit = { method: string; redirect: "manual"; signal: AbortSignal; headers: Record<string, string>; body?: string };
type ProbeFetch = (url: string, init: ProbeInit) => Promise<Response>;
type Answer = { status: number; body: string } | { status: null; reason: string };
type Verdict = { passed: true; result: string } | { passed: false; problem: string; tryAgain: boolean };
type Probe = { path: string; method?: "POST"; headers?: Record<string, string>; body?: string; judge: (answer: Answer) => Verdict };

const inputsSchema = z.object({
  DEPLOY_URL: z.string().trim().url(),
  RELEASE_COMMIT: z.string().trim().regex(/^[0-9a-f]{40}$/, "a 40-character commit SHA"),
  SITE_ENV: z.enum(["staging", "production"]),
});
type Inputs = z.infer<typeof inputsSchema>;

const healthSchema = z.object({
  status: z.literal("ok"),
  release: z.object({ commit: z.string(), environment: z.string() }),
});

const failedRequestSchema = z.object({
  cause: z.object({ code: z.string() }).passthrough().optional().catch(undefined),
  name: z.string().optional().catch(undefined),
});

function whyTheRequestFailed(error: unknown): string {
  const failure = failedRequestSchema.safeParse(error);
  if (!failure.success) return "request failed";
  return failure.data.cause?.code ?? failure.data.name ?? "request failed";
}

const passed = (result: string): Verdict => ({ passed: true, result });
const failed = (problem: string, tryAgain = true): Verdict => ({ passed: false, problem, tryAgain });

function parsedJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function bodyOf200(answer: Answer): string | Verdict {
  if (answer.status === null) return failed(`gave no response (${answer.reason})`);
  if (answer.status !== 200) return failed(`answered ${answer.status}, not 200`);
  return answer.body;
}

const judgeHealth = ({ RELEASE_COMMIT: commit, SITE_ENV: environment }: Inputs) => (answer: Answer): Verdict => {
  const body = bodyOf200(answer);
  if (typeof body !== "string") return body;
  const health = healthSchema.safeParse(parsedJson(body));
  if (!health.success) return failed('answered without {"status":"ok","release":{"commit":...,"environment":...}}');
  const { release } = health.data;
  if (release.commit !== commit) return failed(`reports commit ${release.commit}, not ${commit}, the commit just deployed`);
  if (release.environment !== environment) return failed(`reports environment ${release.environment}, not ${environment}`, false);
  return passed(`200, commit ${commit}, ${environment}`);
};

const judgeStatus = (answer: Answer): Verdict => {
  const body = bodyOf200(answer);
  return typeof body === "string" ? passed("200") : body;
};

const judgeReleasePage = ({ RELEASE_COMMIT: commit }: Inputs) => (answer: Answer): Verdict => {
  const body = bodyOf200(answer);
  if (typeof body !== "string") return body;
  const tag = RELEASE_META_TAG.exec(body)?.[0];
  const named = tag === undefined ? undefined : CONTENT_ATTRIBUTE.exec(tag)?.[1];
  if (named === undefined) return failed('has no <meta name="serplists-release" content="..."> tag');
  if (named !== commit) return failed(`names release ${named}, not ${commit}, the commit just deployed`);
  return passed(`200, release ${commit}`);
};

function judgeSignIn(answer: Answer): Verdict {
  if (answer.status === null) return failed(`gave no response (${answer.reason})`);
  if (answer.status === 401 || answer.status === 403) return passed(`${answer.status}: a made-up account with a wrong password is refused`);
  if (answer.status >= 200 && answer.status < 300) return failed(`answered ${answer.status} to a made-up account with a wrong password`, false);
  return failed(`answered ${answer.status} to a made-up account with a wrong password, not 401 or 403`, answer.status >= 500);
}

const anAccountNoOneHasRegistered = () => ({ email: `deploy-smoke-test-${randomUUID()}@example.com`, password: randomUUID() });

function deploymentProbes(inputs: Inputs): Probe[] {
  return [
    { path: "/api/health", judge: judgeHealth(inputs) },
    { path: "/api/templates", judge: judgeStatus },
    { path: RELEASE_PAGE, judge: judgeReleasePage(inputs) },
    {
      path: SIGN_IN_PATH,
      method: "POST",
      headers: { "content-type": "application/json", origin: new URL(inputs.DEPLOY_URL).origin },
      body: JSON.stringify(anAccountNoOneHasRegistered()),
      judge: judgeSignIn,
    },
  ];
}

async function send(url: string, probe: Probe, { fetchImpl, timeoutMs }: { fetchImpl: ProbeFetch; timeoutMs: number }): Promise<Answer> {
  try {
    const response = await fetchImpl(url, {
      method: probe.method ?? "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { [SMOKE_TEST_HEADER]: "1", ...probe.headers },
      ...(probe.body === undefined ? {} : { body: probe.body }),
    });
    return { status: response.status, body: await response.text() };
  } catch (error) {
    return { status: null, reason: whyTheRequestFailed(error) };
  }
}

type VerifyOptions = {
  attempts?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
  fetchImpl?: ProbeFetch;
  sleep?: (ms: number) => Promise<unknown>;
  log?: (line: string) => unknown;
};

export async function verifyDeployment(
  environment: Record<string, string | undefined>,
  { attempts = 6, retryDelayMs = 10_000, timeoutMs = 30_000, fetchImpl = fetch, sleep = delay, log = console.log }: VerifyOptions = {},
): Promise<number> {
  const inputs = inputsSchema.safeParse(environment);
  if (!inputs.success) {
    const missing = inputs.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    log(`::error::The smoke test needs DEPLOY_URL, RELEASE_COMMIT and SITE_ENV (${missing}).`);
    return 1;
  }
  const baseUrl = inputs.data.DEPLOY_URL.replace(/\/+$/, "");
  for (const probe of deploymentProbes(inputs.data)) {
    const url = `${baseUrl}${probe.path}`;
    for (let attempt = 1; ; attempt += 1) {
      const verdict = probe.judge(await send(url, probe, { fetchImpl, timeoutMs }));
      if (verdict.passed) {
        log(`${probe.method ?? "GET"} ${url} -> ${verdict.result}`);
        break;
      }
      if (!verdict.tryAgain || attempt >= attempts) {
        log(`::error::${probe.method ?? "GET"} ${url} ${verdict.problem}. Check the Worker's deployment logs, bindings and build.`);
        return 1;
      }
      await sleep(retryDelayMs);
    }
  }
  return 0;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.exitCode = await verifyDeployment(process.env);
}
