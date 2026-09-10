import { cleanupLocalTestData, resetLocalTestUserPasswords } from "../../db/maintenance/local";
import { seedLocalTestData, seedOfficialLocalLogin } from "../../db/seeds/local";
import { withLocalD1 } from "./local-d1";

const command = process.argv[2];
const persistFlagIndex = process.argv.indexOf("--persist-to");
const persistPath = persistFlagIndex >= 0 ? process.argv[persistFlagIndex + 1] : undefined;

if (persistFlagIndex >= 0 && !persistPath) {
  throw new Error("--persist-to requires a path");
}

const operations = {
  "seed-test": seedLocalTestData,
  "seed-official-login": seedOfficialLocalLogin,
  cleanup: cleanupLocalTestData,
  "reset-passwords": resetLocalTestUserPasswords,
} as const;

if (!command || !(command in operations)) {
  throw new Error(
    "Usage: tsx scripts/data/local-d1-data.ts <seed-test|seed-official-login|cleanup|reset-passwords> [--persist-to path]",
  );
}

await withLocalD1(persistPath, operations[command as keyof typeof operations]);
