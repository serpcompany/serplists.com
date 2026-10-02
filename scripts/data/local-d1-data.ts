import { cleanupLocalTestData, resetLocalTestUserPasswords } from "../../db/maintenance/local";
import {
  readLocalSeedStatus,
  repairLegacyTestTemplateSlugs,
  seedLocalTestData,
  seedOfficialLocalLogin,
} from "../../db/seeds/local";
import { SEED_STATUS_PREFIX } from "../lib/local-d1-seed.mjs";
import { withLocalD1, type LocalDb } from "./local-d1";

const command = process.argv[2];
const persistFlagIndex = process.argv.indexOf("--persist-to");
const persistPath = persistFlagIndex >= 0 ? process.argv[persistFlagIndex + 1] : undefined;

if (persistFlagIndex >= 0 && !persistPath) {
  throw new Error("--persist-to requires a path");
}

const operations = {
  "seed-test": seedLocalTestData,
  "seed-official-login": seedOfficialLocalLogin,
  "repair-test-slugs": repairLegacyTestTemplateSlugs,
  cleanup: cleanupLocalTestData,
  "reset-passwords": resetLocalTestUserPasswords,
  "seed-status": async (db: LocalDb) => {
    console.log(`${SEED_STATUS_PREFIX}${JSON.stringify(await readLocalSeedStatus(db))}`);
  },
} as const;

const isOperation = (name: string | undefined): name is keyof typeof operations =>
  name !== undefined && Object.hasOwn(operations, name);

if (!isOperation(command)) {
  throw new Error(
    "Usage: tsx scripts/data/local-d1-data.ts <seed-test|seed-official-login|repair-test-slugs|cleanup|reset-passwords|seed-status> [--persist-to path]",
  );
}

await withLocalD1(persistPath, operations[command]);
