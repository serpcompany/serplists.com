import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

const PNPM_COMMANDS = new Set([
  "add",
  "approve-builds",
  "audit",
  "bin",
  "ci",
  "config",
  "create",
  "dedupe",
  "deploy",
  "dlx",
  "doctor",
  "env",
  "exec",
  "fetch",
  "help",
  "i",
  "import",
  "init",
  "install",
  "licenses",
  "link",
  "list",
  "ls",
  "outdated",
  "pack",
  "patch",
  "patch-commit",
  "prune",
  "publish",
  "rebuild",
  "remove",
  "rm",
  "root",
  "self-update",
  "setup",
  "store",
  "unlink",
  "up",
  "update",
  "why",
]);

const OPTIONS_WITH_VALUES = new Set(["--filter", "-F", "--dir", "-C", "--reporter", "--loglevel"]);
const SCRIPT_NAME = /^[a-z][\w:.-]*$/i;

export interface KnownCommands {
  scripts: ReadonlySet<string>;
  binaries: ReadonlySet<string>;
}

function invokedScript(words: readonly string[]): string | undefined {
  let index = 0;
  while ((words[index] ?? "").startsWith("-")) {
    const [option] = (words[index] ?? "").split("=");
    index += OPTIONS_WITH_VALUES.has(option ?? "") && !(words[index] ?? "").includes("=") ? 2 : 1;
  }
  const command = words[index] === "run" ? words[index + 1] : words[index];
  if (command === undefined || !SCRIPT_NAME.test(command) || (words[index] !== "run" && PNPM_COMMANDS.has(command))) return undefined;
  return command;
}

export function pnpmScripts(code: string): string[] {
  return [...code.matchAll(/(?:^|[\s;&|(])pnpm((?:\s+[^\s;&|)]+)+)/g)].flatMap((match) => {
    const script = invokedScript((match[1] ?? "").trim().split(/\s+/));
    return script === undefined ? [] : [script];
  });
}

export const proseScripts = (prose: string) =>
  [...prose.matchAll(/\bpnpm run ([a-z][\w:.-]*\w)/g)].flatMap((match) => (match[1] ? [match[1]] : []));

export const missingScript = (name: string, known: KnownCommands) => !known.scripts.has(name) && !known.binaries.has(name);

const manifest = z.object({ scripts: z.record(z.string()).default({}) });

export function knownCommands(root: string): KnownCommands {
  const packageJson = path.join(root, "package.json");
  const scripts = existsSync(packageJson) ? Object.keys(manifest.parse(JSON.parse(readFileSync(packageJson, "utf8"))).scripts) : [];
  const bin = path.join(root, "node_modules", ".bin");
  const binaries = existsSync(bin) ? readdirSync(bin).map((name) => name.replace(/\.(?:cmd|ps1|exe)$/i, "")) : [];
  return { scripts: new Set(scripts), binaries: new Set(binaries) };
}
