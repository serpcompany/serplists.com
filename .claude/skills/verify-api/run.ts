import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { z } from "zod";

import { RUN_KEY_PERMISSIONS } from "../../../src/lib/schemas/runKeyPermissions";
import { isOwnedDevProcess, readDevSession, stopDevSession } from "../../../scripts/dev-auto-lib";
import { DEV_LOG_PATH } from "../../../scripts/lib/log-mirror";
import { buildScriptInvocation, killProcessTree, REPO_ROOT } from "../../../scripts/lib/run-tool";

const PROTOCOL_VERSION = "2025-06-18";
const RUN_NAME = /^[a-z0-9][a-z0-9-]{0,60}$/;
const API_STEP = /^(GET|POST|PUT|PATCH|DELETE) (\/api\/\S*)$/;
const REFERENCE = /\{\$(\d+)\.([^}]+)\}/g;
const WHOLE_REFERENCE = /^\{\$(\d+)\.([^}]+)\}$/;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const START_LIMIT_MS = 180_000;
const MCP_HEADERS = { Accept: "application/json, text/event-stream" };
const USAGE =
  "Usage: node --import tsx .claude/skills/verify-api/run.ts <name> <plan.json> [--base <url>]\n" +
  "Runs the plan's steps against this checkout's server (dev:all, started when none runs) as a signed-in seeded user\n" +
  "with a Run Key made for the run, keeps each request and answer in tmp/agent/verify/<date>-<name>/, then revokes the\n" +
  "key and stops only what it started. See .claude/skills/verify-api/SKILL.md.";

const apiStepSchema = z
  .object({
    api: z.string().regex(API_STEP, 'Write an API step as "<METHOD> /api/<path>"'),
    body: z.unknown().optional(),
    expect: z.number().int().min(100).max(599).optional(),
  })
  .strict();
const mcpStepSchema = z.object({ mcp: z.string().min(1), params: z.record(z.unknown()).optional(), expect: z.string().optional() }).strict();
const toolStepSchema = z.object({ tool: z.string().min(1), arguments: z.record(z.unknown()).optional(), expect: z.string().optional() }).strict();
const planSchema = z
  .object({
    user: z.string().email().default("admin@test.com"),
    password: z.string().min(1).default("password123"),
    permissions: z.array(z.enum(RUN_KEY_PERMISSIONS)).min(1).optional(),
    steps: z
      .array(z.union([apiStepSchema, mcpStepSchema, toolStepSchema]))
      .min(1, "List at least one step: a run that asks for nothing proves nothing."),
  })
  .strict();
const createdKeySchema = z.object({ key: z.object({ id: z.string(), permissions: z.array(z.string()) }), secret: z.string().min(1) });
const rpcSchema = z.object({
  result: z.object({ isError: z.boolean().optional(), structuredContent: z.unknown().optional() }).passthrough().optional(),
  error: z.object({ code: z.number() }).passthrough().optional(),
});
const toolErrorSchema = z.object({ error: z.string() });
const serverInfoSchema = z.object({ result: z.object({ serverInfo: z.object({ name: z.string(), version: z.string() }) }) });
const listSchema = z.array(z.unknown());
const recordSchema = z.record(z.unknown());

type Plan = z.output<typeof planSchema>;
type Step = Plan["steps"][number];
type Answer = { status: number; requestId: string | null; body: unknown };
type Server = { base: string; description: string; logged: boolean; stop: () => Promise<void> };
type Outcome = { label: string; sent: unknown; answer: Answer; outcome: string; expected: string; passed: boolean; value: unknown };

const pad = (number: number) => String(number).padStart(2, "0");
const git = (...args: string[]) => execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" }).trim();

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch {
    return text;
  }
}

async function call(base: string, method: string, route: string, headers: Record<string, string>, body?: unknown): Promise<Answer> {
  const response = await fetch(new URL(route, base), {
    method,
    headers: { Origin: new URL(base).origin, ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(60_000),
  });
  return { status: response.status, requestId: response.headers.get("x-request-id"), body: await readBody(response) };
}

const answersHealth = (base: string) =>
  fetch(new URL("/api/health", base), { signal: AbortSignal.timeout(5_000) }).then(
    (response) => response.ok,
    () => false,
  );

function childOf(value: unknown, key: string): unknown {
  const list = listSchema.safeParse(value);
  if (list.success) return list.data[Number(key)];
  const record = recordSchema.safeParse(value);
  return record.success ? record.data[key] : undefined;
}

function referenced(answers: readonly unknown[], step: string, keyPath: string): unknown {
  const index = Number(step) - 1;
  if (index < 0 || index >= answers.length) throw new Error(`{$${step}.${keyPath}} names step ${step}, which hasn't run yet.`);
  const found = keyPath.split(".").reduce<unknown>((value, key) => childOf(value, key), answers[index]);
  if (found === undefined) throw new Error(`Step ${step}'s answer has nothing at ${keyPath}.`);
  return found;
}

const interpolated = (text: string, answers: readonly unknown[]) =>
  text.replace(REFERENCE, (_, step: string, keyPath: string) => {
    const found = referenced(answers, step, keyPath);
    return typeof found === "string" ? found : JSON.stringify(found);
  });

function resolved(value: unknown, answers: readonly unknown[]): unknown {
  if (typeof value === "string") {
    const whole = WHOLE_REFERENCE.exec(value);
    return whole ? referenced(answers, whole[1] ?? "", whole[2] ?? "") : interpolated(value, answers);
  }
  const list = listSchema.safeParse(value);
  if (list.success) return list.data.map((item) => resolved(item, answers));
  const record = recordSchema.safeParse(value);
  if (record.success) return Object.fromEntries(Object.entries(record.data).map(([key, item]) => [key, resolved(item, answers)]));
  return value;
}

function mcpOutcome(answer: Answer): { outcome: string; value: unknown } {
  const rpc = rpcSchema.safeParse(answer.body);
  if (answer.status !== 200 || !rpc.success) return { outcome: `HTTP ${answer.status}`, value: answer.body };
  if (rpc.data.error) return { outcome: `rpc ${rpc.data.error.code}`, value: rpc.data.error };
  const result = rpc.data.result;
  if (result?.isError) return { outcome: toolErrorSchema.safeParse(result.structuredContent).data?.error ?? "error", value: result.structuredContent };
  return { outcome: "ok", value: result?.structuredContent ?? result };
}

async function signIn(base: string, plan: Plan): Promise<string> {
  const answer = await fetch(new URL("/api/auth/sign-in/email", base), {
    method: "POST",
    headers: { Origin: new URL(base).origin, "Content-Type": "application/json" },
    body: JSON.stringify({ email: plan.user, password: plan.password }),
    signal: AbortSignal.timeout(60_000),
  });
  const cookie = answer.headers
    .getSetCookie()
    .map((line) => line.split(";")[0] ?? "")
    .filter(Boolean)
    .join("; ");
  if (!answer.ok || !cookie) {
    throw new Error(`Signing in as ${plan.user} answered ${answer.status}. Seed the users with pnpm run db:seed (docs/agents/development-environment.md, Sign in).`);
  }
  return cookie;
}

async function startDevAll(): Promise<Server> {
  const invocation = buildScriptInvocation(path.join(REPO_ROOT, "scripts", "dev-auto.ts"));
  const child = spawn(invocation.command, invocation.args, { cwd: REPO_ROOT, stdio: "ignore", windowsHide: true });
  const stop = async () => {
    const session = readDevSession();
    if (session && session.pid === child.pid) await stopDevSession({ session });
    else killProcessTree(child);
  };
  const giveUpAt = Date.now() + START_LIMIT_MS;
  while (Date.now() < giveUpAt) {
    await sleep(1_000);
    if (child.exitCode !== null) throw new Error(`dev:all stopped (exit ${child.exitCode}) before it answered. Read ${DEV_LOG_PATH}.`);
    const session = readDevSession();
    if (session && session.pid === child.pid && (await answersHealth(`http://localhost:${session.port}`))) {
      const description = `this checkout's dev:all, started by this run (launcher pid ${session.pid}); stopped at the end`;
      return { base: `http://localhost:${session.port}`, description, logged: true, stop };
    }
  }
  await stop();
  throw new Error(`dev:all didn't answer /api/health within ${START_LIMIT_MS / 1000} seconds. Read ${DEV_LOG_PATH}.`);
}

async function serverFor(base: string | undefined): Promise<Server> {
  if (base !== undefined) {
    const url = new URL(base);
    if (!LOOPBACK_HOSTS.has(url.hostname)) {
      throw new Error(`${base} isn't this machine. verify-api checks this checkout's own server, never Staging or Production.`);
    }
    return { base: url.origin, description: "given with --base; this run starts and stops no server", logged: false, stop: async () => undefined };
  }
  const session = readDevSession();
  const running = `http://localhost:${session?.port ?? 0}`;
  if (session && (await isOwnedDevProcess(session.pid, session.startedAt)) && (await answersHealth(running))) {
    const description = `this checkout's dev:all, already running (launcher pid ${session.pid ?? "unknown"}); left running`;
    return { base: running, description, logged: true, stop: async () => undefined };
  }
  return startDevAll();
}

async function runStep(step: Step, number: number, base: string, cookie: string, secret: string, answers: readonly unknown[]): Promise<Outcome> {
  if ("api" in step) {
    const line = interpolated(step.api, answers);
    const [, method, route] = API_STEP.exec(line) ?? [];
    if (!method || !route) throw new Error(`Step ${number} reads "${line}" once its references are filled in, which isn't "<METHOD> /api/<path>".`);
    const body = resolved(step.body, answers);
    const answer = await call(base, method, route, { Cookie: cookie }, body);
    const passed = step.expect === undefined ? answer.status >= 200 && answer.status < 300 : answer.status === step.expect;
    const expected = step.expect === undefined ? "2xx" : String(step.expect);
    return { label: line, sent: { method, route, body }, answer, outcome: String(answer.status), expected, passed, value: answer.body };
  }
  const method = "tool" in step ? "tools/call" : step.mcp;
  const params = "tool" in step ? { name: step.tool, arguments: resolved(step.arguments ?? {}, answers) } : resolved(step.params, answers);
  const headers = { ...MCP_HEADERS, Authorization: `Bearer ${secret}`, "MCP-Protocol-Version": PROTOCOL_VERSION };
  const answer = await call(base, "POST", "/api/mcp", headers, { jsonrpc: "2.0", id: number, method, ...(params === undefined ? {} : { params }) });
  const { outcome, value } = mcpOutcome(answer);
  const expected = step.expect ?? "ok";
  const label = "tool" in step ? `MCP ${step.tool}` : `MCP ${step.mcp}`;
  return { label, sent: { method, params }, answer, outcome, expected, passed: outcome === expected, value };
}

async function doctor(server: Server, plan: Plan, secret: string, health: Answer, permissions: readonly string[]): Promise<string> {
  const initialize = await call(server.base, "POST", "/api/mcp", { ...MCP_HEADERS, Authorization: `Bearer ${secret}` }, {
    jsonrpc: "2.0",
    id: 0,
    method: "initialize",
    params: { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "verify-api", version: "1" } },
  });
  const serverInfo = serverInfoSchema.safeParse(initialize.body).data?.result.serverInfo;
  const changed = git("status", "--porcelain").split("\n").filter(Boolean).length;
  return [
    `server: ${server.base}, ${server.description}`,
    `commit: ${git("rev-parse", "--short", "HEAD")} on ${git("branch", "--show-current") || "a detached HEAD"}, ${changed} files changed since`,
    `health: ${health.status} ${JSON.stringify(health.body)}`,
    `user: ${plan.user}, with a Run Key for ${permissions.join(", ")}`,
    `mcp: ${serverInfo ? `${serverInfo.name} ${serverInfo.version}` : `initialize answered ${initialize.status}`}`,
  ].join("\n");
}

async function run(name: string, plan: Plan, server: Server, folder: string): Promise<number> {
  const record = (file: string, text: string) => writeFileSync(path.join(folder, file), text.endsWith("\n") ? text : `${text}\n`);
  const health = await call(server.base, "GET", "/api/health", {});
  const cookie = await signIn(server.base, plan);
  const lines: string[] = [];
  const cleanup: string[] = [];
  const requestIds: string[] = [];
  let keyId: string | null = null;
  try {
    const requested = { name: `verify-api ${name}`, ...(plan.permissions ? { permissions: plan.permissions } : {}) };
    const key = createdKeySchema.parse((await call(server.base, "POST", "/api/agent-keys", { Cookie: cookie }, requested)).body);
    keyId = key.key.id;
    record("doctor.txt", await doctor(server, plan, key.secret, health, key.key.permissions));
    const answers: unknown[] = [];
    for (const [index, step] of plan.steps.entries()) {
      const result = await runStep(step, index + 1, server.base, cookie, key.secret, answers);
      answers.push(result.value);
      if (result.answer.requestId) requestIds.push(result.answer.requestId);
      const { status, requestId, body } = result.answer;
      record(`${pad(index + 1)}.json`, JSON.stringify({ sent: result.sent, status, requestId, answer: body }, null, 2));
      const verdict = result.passed ? "as expected" : "UNEXPECTED";
      const line = `${pad(index + 1)} ${verdict}: ${result.outcome} (expected ${result.expected}) ${result.label}, request ${requestId ?? "without an id"}`;
      lines.push(line);
      console.log(line);
    }
  } finally {
    if (keyId) cleanup.push(`cleanup: revoked the Run Key ${keyId}: ${(await call(server.base, "DELETE", `/api/agent-keys/${keyId}`, { Cookie: cookie })).status}`);
    cleanup.push(`cleanup: signed out: ${(await call(server.base, "POST", "/api/auth/sign-out", { Cookie: cookie }, {})).status}`);
    record("requests.txt", [...lines, ...cleanup].join("\n"));
    const logged = server.logged && existsSync(DEV_LOG_PATH);
    const log = logged ? readFileSync(DEV_LOG_PATH, "utf8").split(/\r?\n/).filter((line) => requestIds.some((id) => line.includes(id))) : [];
    record("server.log", logged ? log.join("\n") : `No log: this run's server writes none to ${DEV_LOG_PATH}.`);
  }
  const unexpected = lines.filter((line) => line.includes("UNEXPECTED")).length;
  console.log(`Proof: ${path.relative(REPO_ROOT, folder)} (doctor.txt, requests.txt, each step's NN.json, server.log)`);
  if (unexpected > 0) console.log(`${unexpected} of ${lines.length} answers weren't what the plan expected.`);
  return unexpected > 0 || lines.length === 0 ? 1 : 0;
}

function readPlan(planFile: string): Plan | string {
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(path.resolve(planFile), "utf8"));
  } catch (error) {
    return `${planFile} can't be read as JSON: ${error instanceof Error ? error.message : String(error)}`;
  }
  const plan = planSchema.safeParse(json);
  if (plan.success) return plan.data;
  return `${planFile} isn't a plan: ${plan.error.issues.map((issue) => `${issue.path.join(".") || "plan"}: ${issue.message}`).join("; ")}`;
}

async function main(argv: readonly string[]): Promise<number> {
  const baseFlag = argv.indexOf("--base");
  const base = baseFlag === -1 ? undefined : argv[baseFlag + 1];
  const positional = argv.filter((_, index) => baseFlag === -1 || (index !== baseFlag && index !== baseFlag + 1));
  const [name, planFile, ...extra] = positional;
  if (!name || !planFile || extra.length > 0 || !RUN_NAME.test(name) || (baseFlag !== -1 && !base)) {
    console.error(USAGE);
    return 2;
  }
  const plan = readPlan(planFile);
  if (typeof plan === "string") {
    console.error(`${plan}\n${USAGE}`);
    return 2;
  }
  process.chdir(REPO_ROOT);
  const folder = path.join(REPO_ROOT, "tmp", "agent", "verify", `${new Date().toISOString().slice(0, 10)}-${name}`);
  mkdirSync(folder, { recursive: true });
  const { user, permissions, steps } = plan;
  writeFileSync(path.join(folder, "plan.json"), `${JSON.stringify({ user, permissions, steps }, null, 2)}\n`);
  const server = await serverFor(base);
  try {
    writeFileSync(path.join(folder, "run.json"), `${JSON.stringify({ folder: path.relative(REPO_ROOT, folder), base: server.base, server: server.description, user }, null, 2)}\n`);
    return await run(name, plan, server, folder);
  } finally {
    await server.stop();
  }
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
