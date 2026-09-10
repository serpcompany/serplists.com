import { copyFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const MIGRATION_FILE = /^\d{4}_[a-z0-9_]+\.sql$/;

function migrationPrefix(name) {
  return name.slice(0, 4);
}

export function listOrderedMigrationNames(sourceDirectory, throughMigration) {
  const names = readdirSync(sourceDirectory)
    .filter((name) => MIGRATION_FILE.test(name))
    .sort((left, right) => left.localeCompare(right, 'en'));
  if (!throughMigration) return names;
  const end = names.indexOf(throughMigration);
  if (end === -1) throw new Error(`Unknown migration boundary: ${throughMigration}`);
  return names.slice(0, end + 1);
}

export function planOrderedWranglerReplay(names) {
  const duplicatePrefixes = new Set(
    names
      .map(migrationPrefix)
      .filter((prefix, index, prefixes) => prefixes.indexOf(prefix) !== prefixes.lastIndexOf(prefix)),
  );
  const stages = [];
  names.forEach((name, index) => {
    if (duplicatePrefixes.has(migrationPrefix(name))) stages.push(names.slice(0, index + 1));
  });
  if (names.length && stages.at(-1)?.length !== names.length) stages.push(names);
  return stages;
}

/**
 * Replays immutable migrations through Wrangler without allowing tied numeric
 * prefixes to inherit the host filesystem's directory order. Each tied legacy
 * file is exposed under its original name and bytes in a cumulative stage.
 * @param {{
 *   sourceDirectory: string;
 *   ownedDirectory: string;
 *   throughMigration?: string;
 *   apply: () => unknown | Promise<unknown>;
 * }} options
 */
export async function applyOrderedWranglerMigrations({
  sourceDirectory,
  ownedDirectory,
  throughMigration = undefined,
  apply,
}) {
  const names = listOrderedMigrationNames(sourceDirectory, throughMigration);
  const copied = new Set();
  for (const stage of planOrderedWranglerReplay(names)) {
    for (const name of stage) {
      if (copied.has(name)) continue;
      copyFileSync(path.join(sourceDirectory, name), path.join(ownedDirectory, name));
      copied.add(name);
    }
    await apply();
  }
  return names;
}
