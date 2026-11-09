import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { z } from "zod";

import { buildScriptInvocation } from "../lib/run-tool";
import { renderDevVars } from "../setup-local-lib";
import { packageBin, quietEnvironment, run, runNode } from "./tools";

export const generatorChecks: ReadonlyArray<{ check: string; fix: string }> = [
  { check: "schema:portable:check", fix: "schema:portable:generate" },
  { check: "db:schema:check", fix: "db:schema:generate" },
  { check: "templates:check", fix: "templates:generate" },
];

export const CLOUDFLARE_TYPES = "cloudflare-env.d.ts";
const PLACEHOLDER_SECRET = "a-placeholder-secret-of-32-characters";
const NODE_WITH_TSX = /^node --import tsx (\S+)((?: \S+)*)$/;
const manifest = z.object({ scripts: z.record(z.string()) });

export function scriptCommand(at: string, name: string): { script: string; args: string[] } {
  const command = manifest.parse(JSON.parse(readFileSync(path.join(at, "package.json"), "utf8"))).scripts[name] ?? "";
  const match = NODE_WITH_TSX.exec(command);
  if (!match?.[1]) throw new Error(`package.json's "${name}" script must be "node --import tsx <script> [arguments]" for the generated check to run it.`);
  return { script: match[1], args: (match[2] ?? "").split(" ").filter(Boolean) };
}

export function staleGenerator(at: string, check: string, fix: string): string | undefined {
  const { script, args } = scriptCommand(at, check);
  const invocation = buildScriptInvocation(path.join(at, script), args);
  const ran = run(invocation.command, invocation.args, { cwd: at, env: quietEnvironment() });
  return ran.status === 0 ? undefined : `pnpm run ${check} failed: run pnpm run ${fix} and commit what it writes.\n${ran.output}`;
}

function regeneratedCloudflareTypes(at: string): string {
  const folder = mkdtempSync(path.join(tmpdir(), "serplists-types-"));
  try {
    copyFileSync(path.join(at, "wrangler.toml"), path.join(folder, "wrangler.toml"));
    const example = readFileSync(path.join(at, ".dev.vars.example"), "utf8");
    writeFileSync(path.join(folder, ".dev.vars"), renderDevVars(example, PLACEHOLDER_SECRET));
    mkdirSync(path.join(folder, ".open-next"));
    writeFileSync(path.join(folder, ".open-next", "worker.js"), "export default {};\n");
    const ran = runNode(packageBin("wrangler", "wrangler"), ["types", "--env-interface", "CloudflareEnv", `./${CLOUDFLARE_TYPES}`], {
      cwd: folder,
      env: { ...quietEnvironment(), WRANGLER_SEND_METRICS: "false" },
    });
    if (ran.status !== 0) throw new Error(`wrangler types failed (exit ${ran.status}): ${ran.output}`);
    return readFileSync(path.join(folder, CLOUDFLARE_TYPES), "utf8");
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

export function firstDifferentLine(committed: string, generated: string): number | undefined {
  const left = committed.replace(/\r\n/g, "\n").split("\n");
  const right = generated.replace(/\r\n/g, "\n").split("\n");
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) if (left[index] !== right[index]) return index + 1;
  return undefined;
}

export function staleCloudflareTypes(at: string, generate = regeneratedCloudflareTypes): string | undefined {
  const line = firstDifferentLine(readFileSync(path.join(at, CLOUDFLARE_TYPES), "utf8"), generate(at));
  if (line === undefined) return undefined;
  return (
    `${CLOUDFLARE_TYPES}:${line}  differs from what wrangler types writes from wrangler.toml and the .dev.vars ` +
    "pnpm run setup creates: run pnpm run cf-typegen in a checkout whose .dev.vars pnpm run setup wrote, and commit it"
  );
}

export function staleGeneratedFiles(at: string): string[] {
  const stale = generatorChecks.flatMap(({ check, fix }) => staleGenerator(at, check, fix) ?? []);
  const types = staleCloudflareTypes(at);
  return types === undefined ? stale : [...stale, types];
}
