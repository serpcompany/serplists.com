import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  loadEnvironmentInventory,
  resolveEnvironmentIdentity,
  validateEnvironmentInventory,
} from "./environment-identity-lib.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const productionDatabaseId = "b62ccc0a-9c69-4828-9e9b-3bac6ba0e4f1";

describe("environment identity", () => {
  it("loads an inventory that agrees with the checked-in Wrangler bindings", () => {
    const inventory = loadEnvironmentInventory({ repoRoot });
    const wranglerToml = readFileSync(path.join(repoRoot, "wrangler.toml"), "utf8");

    expect(validateEnvironmentInventory({ inventory, wranglerToml })).toEqual({
      productionDatabaseId,
      stagingDatabaseId: "fcaf4325-5be7-4ead-ab60-45932a04177b",
    });
    expect(inventory.environments.local.migrationLevel).toBe("repository-latest");
    expect(inventory.environments.rehearsal.databaseId).toBe("runtime-required");
  });

  it("refuses a top-level preview binding that points at production", () => {
    const inventory = loadEnvironmentInventory({ repoRoot });
    const wranglerToml = readFileSync(path.join(repoRoot, "wrangler.toml"), "utf8").replace(
      'preview_database_id = "fcaf4325-5be7-4ead-ab60-45932a04177b"',
      `preview_database_id = "${productionDatabaseId}"`,
    );

    expect(() => validateEnvironmentInventory({ inventory, wranglerToml })).toThrow(
      /top-level preview/i,
    );
  });

  it("requires distinct local, staging, and production inventory identities", () => {
    const inventory = loadEnvironmentInventory({ repoRoot });
    inventory.environments.local.databaseId = inventory.environments.staging.databaseId;
    const wranglerToml = readFileSync(path.join(repoRoot, "wrangler.toml"), "utf8");

    expect(() => validateEnvironmentInventory({ inventory, wranglerToml })).toThrow(
      /duplicate database identity/i,
    );
  });

  it("refuses every non-production environment when it resolves to production", () => {
    const inventory = loadEnvironmentInventory({ repoRoot });

    for (const environment of ["local", "staging", "rehearsal"]) {
      expect(() =>
        resolveEnvironmentIdentity({
          environment,
          inventory,
          databaseId: productionDatabaseId,
          databaseName:
            environment === "rehearsal"
              ? "serp-checklists-rehearsal-issue-95"
              : inventory.environments[environment].databaseName,
        }),
      ).toThrow(/production database/i);
    }
  });

  it("requires an exact runtime identity for an ephemeral rehearsal", () => {
    const inventory = loadEnvironmentInventory({ repoRoot });

    expect(() =>
      resolveEnvironmentIdentity({ environment: "rehearsal", inventory }),
    ).toThrow("Rehearsal operations require --database-id");

    expect(
      resolveEnvironmentIdentity({
        environment: "rehearsal",
        inventory,
        databaseId: "8ab2b7e9-0ce8-4d1e-b42f-8601eb256b67",
        databaseName: "serp-checklists-rehearsal-issue-95",
      }),
    ).toMatchObject({
      environment: "rehearsal",
      binding: "DB",
      databaseName: "serp-checklists-rehearsal-issue-95",
      databaseId: "8ab2b7e9-0ce8-4d1e-b42f-8601eb256b67",
      isRemote: true,
    });

    expect(() =>
      resolveEnvironmentIdentity({
        environment: "rehearsal",
        inventory,
        databaseId: inventory.environments.staging.databaseId,
        databaseName: "serp-checklists-rehearsal-issue-95",
      }),
    ).toThrow(/staging database/i);
  });
});
