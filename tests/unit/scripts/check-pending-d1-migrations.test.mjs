import { describe, expect, it } from "vitest";

import { evaluateMigrationListResult } from "../../../scripts/check-pending-d1-migrations.mjs";

describe("pending D1 migration gate", () => {
  it("passes only Wrangler's explicit no-pending result", () => {
    expect(evaluateMigrationListResult({
      status: 0,
      stdout: "\u001b[32m✅ No migrations to apply!\u001b[0m\n",
    })).toEqual({ ok: true, reason: "no_pending_migrations" });
  });

  it("blocks deployment when migrations are pending", () => {
    expect(evaluateMigrationListResult({
      status: 0,
      stdout: "Migrations to be applied:\n0024_safe_template_evolution.sql\n",
    })).toEqual({ ok: false, reason: "pending_migrations" });
  });

  it("fails closed when Wrangler fails", () => {
    expect(evaluateMigrationListResult({ status: 1 })).toEqual({
      ok: false,
      reason: "wrangler_failed",
    });
    expect(evaluateMigrationListResult({
      status: null,
      error: new Error("spawn failed"),
    })).toEqual({ ok: false, reason: "wrangler_failed" });
  });

  it("fails closed when successful output is unrecognized", () => {
    expect(evaluateMigrationListResult({
      status: 0,
      stdout: "Migration status unavailable\n",
    })).toEqual({ ok: false, reason: "unrecognized_output" });
  });
});
