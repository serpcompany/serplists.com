import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { runProductionIdentityBoundCommand } from "./production-identity-bound-command-lib.mjs";

const database = { databaseName: "serp-checklists-db", databaseId: "11111111-1111-4111-8111-111111111111" };
const identity = (databaseId = database.databaseId) => JSON.stringify({ name: database.databaseName, uuid: databaseId });

describe("production identity-bound remote commands", () => {
  it("routes every production bookmark, export, ledger, invariant query, and migration command through the wrapper", () => {
    const source = readFileSync(new URL("./production-executor.mjs", import.meta.url), "utf8");
    for (const operation of ["recovery-bookmark", "recovery-export", "reviewed-pending-range", "migration-apply", "post-apply-ledger"]) {
      expect(source).toContain(`identityBound("${operation}"`);
    }
    expect(source).toContain("runWrangler: (args) => identityBound(`${phase}-invariant-query`, args)");
    for (const command of ["time-travel", "export", "migrations\", \"apply", "migrations\", \"list"]) {
      expect(source).not.toContain(`output = pnpm(["exec", "wrangler", "d1", "${command}`);
    }
  });

  it("executes one command only between matching before/after identities and returns bound evidence", () => {
    const calls = [];
    const result = runProductionIdentityBoundCommand({
      environment: "production",
      database,
      operation: "migration-apply",
      commandArgs: ["d1", "migrations", "apply", database.databaseName, "--remote"],
      runWrangler: (args) => {
        calls.push(args);
        return args[1] === "info" ? identity() : "applied";
      },
    });
    expect(calls).toEqual([
      ["d1", "info", database.databaseName, "--json"],
      ["d1", "migrations", "apply", database.databaseName, "--remote"],
      ["d1", "info", database.databaseName, "--json"],
    ]);
    expect(result).toMatchObject({ output: "applied", operation: "migration-apply", observedIdentity: { databaseName: database.databaseName, databaseId: database.databaseId, before: { databaseId: database.databaseId }, after: { databaseId: database.databaseId } } });
  });

  it("stops before the sensitive command when the immediate identity mismatches", () => {
    let sensitiveCalls = 0;
    expect(() => runProductionIdentityBoundCommand({
      environment: "production", database, operation: "export",
      commandArgs: ["d1", "export", database.databaseName, "--remote"],
      runWrangler: (args) => {
        if (args[1] !== "info") sensitiveCalls += 1;
        return identity("22222222-2222-4222-8222-222222222222");
      },
    })).toThrow(/identity changed/i);
    expect(sensitiveCalls).toBe(0);
  });

  it("rejects evidence when the UUID switches after the command", () => {
    let identityCalls = 0;
    let sensitiveCalls = 0;
    expect(() => runProductionIdentityBoundCommand({
      environment: "production", database, operation: "export",
      commandArgs: ["d1", "export", database.databaseName, "--remote"],
      runWrangler: (args) => {
        if (args[1] === "info") return identity(++identityCalls === 1 ? database.databaseId : "22222222-2222-4222-8222-222222222222");
        sensitiveCalls += 1;
        return "exported";
      },
    })).toThrow(/identity changed/i);
    expect(sensitiveCalls).toBe(1);
  });
});
