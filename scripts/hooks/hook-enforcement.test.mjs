import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import yaml from "js-yaml";
import { afterEach, describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const temporaryDirectories = [];

function run(command, args, { cwd, env = {} } = {}) {
  return spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

function git(repository, args, options = {}) {
  return run("git", args, { cwd: repository, ...options });
}

function createHookFixture() {
  const repository = mkdtempSync(join(tmpdir(), "serplists-hook-test-"));
  temporaryDirectories.push(repository);
  const hookLog = join(repository, "hook.log");
  mkdirSync(join(repository, ".husky", "_"), { recursive: true });
  writeFileSync(join(repository, ".husky", "_", "pre-commit"), "obsolete\n");
  writeFileSync(
    join(repository, "hook-probe.mjs"),
    [
      'import { appendFileSync } from "node:fs";',
      "const hook = process.argv[2];",
      'appendFileSync(process.env.HOOK_LOG, `${hook}\\n`);',
      'if (process.env[`FAIL_${hook.replaceAll("-", "_").toUpperCase()}`] === "1") process.exit(42);',
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(repository, "lefthook.yml"),
    [
      "pre-commit:",
      "  commands:",
      "    probe:",
      "      run: node hook-probe.mjs pre-commit",
      "pre-push:",
      "  commands:",
      "    probe:",
      "      run: node hook-probe.mjs pre-push",
      "",
    ].join("\n"),
  );
  writeFileSync(join(repository, ".gitignore"), "hook.log\n");

  expect(git(repository, ["init", "-b", "staging"]).status).toBe(0);
  expect(git(repository, ["config", "user.name", "Hook Test"]).status).toBe(0);
  expect(git(repository, ["config", "user.email", "hook-test@example.invalid"]).status).toBe(0);
  expect(git(repository, ["config", "core.hooksPath", ".husky/_"]).status).toBe(0);
  return { hookLog, repository };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("Git hook installation and enforcement", () => {
  it("replaces stale Husky state and proves pre-commit and pre-push success and failure paths", () => {
    const { hookLog, repository } = createHookFixture();
    const install = run(process.execPath, [join(repositoryRoot, "scripts/install-lefthook.mjs")], {
      cwd: repository,
      env: {
        CI: "",
        PATH: `${join(repositoryRoot, "node_modules", ".bin")}${delimiter}${process.env.PATH}`,
      },
    });

    expect(install.status, install.stderr).toBe(0);
    expect(git(repository, ["config", "--local", "--get-all", "core.hooksPath"]).status).toBe(1);
    expect(readFileSync(join(repository, ".husky", "_", "pre-commit"), "utf8")).toBe("obsolete\n");
    expect(git(repository, ["rev-parse", "--git-path", "hooks"]).stdout.trim()).toBe(".git/hooks");

    expect(git(repository, ["add", "."]).status).toBe(0);
    const firstCommit = git(repository, ["commit", "-m", "initial"], { env: { HOOK_LOG: hookLog } });
    expect(firstCommit.status, firstCommit.stderr).toBe(0);
    expect(readFileSync(hookLog, "utf8")).toContain("pre-commit\n");

    writeFileSync(join(repository, "change.txt"), "blocked commit\n");
    expect(git(repository, ["add", "change.txt"]).status).toBe(0);
    const blockedCommit = git(repository, ["commit", "-m", "must fail"], {
      env: { FAIL_PRE_COMMIT: "1", HOOK_LOG: hookLog },
    });
    expect(blockedCommit.status).not.toBe(0);

    const bypassedCommit = git(repository, ["commit", "--no-verify", "-m", "local bypass demonstration"], {
      env: { FAIL_PRE_COMMIT: "1", HOOK_LOG: hookLog },
    });
    expect(bypassedCommit.status, bypassedCommit.stderr).toBe(0);

    const remote = mkdtempSync(join(tmpdir(), "serplists-hook-remote-"));
    temporaryDirectories.push(remote);
    expect(run("git", ["init", "--bare"], { cwd: remote }).status).toBe(0);
    expect(git(repository, ["remote", "add", "origin", remote]).status).toBe(0);
    const firstPush = git(repository, ["push", "-u", "origin", "staging"], { env: { HOOK_LOG: hookLog } });
    expect(firstPush.status, firstPush.stderr).toBe(0);
    expect(readFileSync(hookLog, "utf8")).toContain("pre-push\n");

    writeFileSync(join(repository, "change.txt"), "blocked push\n");
    expect(git(repository, ["add", "change.txt"]).status).toBe(0);
    expect(git(repository, ["commit", "--no-verify", "-m", "push failure fixture"], { env: { HOOK_LOG: hookLog } }).status).toBe(0);
    const blockedPush = git(repository, ["push", "origin", "staging"], {
      env: { FAIL_PRE_PUSH: "1", HOOK_LOG: hookLog },
    });
    expect(blockedPush.status).not.toBe(0);
  });

  it("keeps remote database enforcement independent from bypassable local hooks", () => {
    const hooks = yaml.load(readFileSync(join(repositoryRoot, "lefthook.yml"), "utf8"));
    const workflow = yaml.load(readFileSync(join(repositoryRoot, ".github/workflows/ci.yml"), "utf8"));

    expect(hooks["pre-commit"].commands["migration-provenance"].run).toContain("check:data:migration-provenance");
    expect(hooks["pre-push"].commands["data-regressions"].run).toContain("test:data-regressions");
    expect(workflow.jobs.database.steps.some((step) => step.run?.includes("check:data:migration-provenance"))).toBe(true);
    expect(workflow.jobs.database.steps.some((step) => step.run?.includes("check:data:schema-contract"))).toBe(true);
    expect(workflow.jobs["data-regressions"].steps.some((step) => step.run?.includes("test:data-regressions"))).toBe(true);
  });

  it("ignores poisoned Git-local environment and never mutates the parent repository", () => {
    const { repository: target } = createHookFixture();
    const parent = mkdtempSync(join(tmpdir(), "serplists-hook-parent-"));
    temporaryDirectories.push(parent);
    expect(git(parent, ["init", "-b", "staging"]).status).toBe(0);
    expect(git(parent, ["config", "core.hooksPath", "parent-hooks"]).status).toBe(0);
    mkdirSync(join(parent, "parent-hooks"));
    writeFileSync(join(parent, "parent-hooks", "sentinel"), "parent must not change\n");
    const parentConfigBefore = git(parent, ["config", "--local", "--list"]).stdout;
    const parentHooksBefore = readdirSync(join(parent, "parent-hooks"));

    const install = run(process.execPath, [join(repositoryRoot, "scripts/install-lefthook.mjs")], {
      cwd: target,
      env: {
        CI: "",
        GIT_DIR: join(parent, ".git"),
        GIT_INDEX_FILE: join(parent, ".git", "index"),
        GIT_WORK_TREE: parent,
        PATH: `${join(repositoryRoot, "node_modules", ".bin")}${delimiter}${process.env.PATH}`,
      },
    });

    expect(install.status, install.stderr).toBe(0);
    expect(git(target, ["config", "--local", "--get-all", "core.hooksPath"]).status).toBe(1);
    expect(existsSync(join(target, ".git", "hooks", "pre-commit"))).toBe(true);
    expect(existsSync(join(target, ".git", "hooks", "pre-push"))).toBe(true);
    expect(git(parent, ["config", "--local", "--list"]).stdout).toBe(parentConfigBefore);
    expect(readdirSync(join(parent, "parent-hooks"))).toEqual(parentHooksBefore);
    expect(readFileSync(join(parent, "parent-hooks", "sentinel"), "utf8")).toBe("parent must not change\n");
  });
});
