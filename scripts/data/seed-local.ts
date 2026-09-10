import { DatabaseSync } from 'node:sqlite';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { applyAllLocalSeeds, applyOfficialLocalLoginSeed, applyOfficialTemplatesSeed, applyTestDataSeed, cleanupTestDataSeed } from '../../db/seeds/index';
import { createSQLiteProxy } from './sqlite-proxy';
import { listMigrationFiles } from './schema-contract';

function valueAfter(name: string) {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

function filesBelow(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(root, entry.name);
    return entry.isDirectory() ? filesBelow(target) : [target];
  });
}

export function locateMigratedDatabase(persistPath: string) {
  const expected = listMigrationFiles().map(({ name }) => name);
  const matches = filesBelow(persistPath).filter((file) => file.endsWith('.sqlite')).filter((file) => {
    const database = new DatabaseSync(file);
    try {
      const table = database.prepare("select name from sqlite_schema where type='table' and name='d1_migrations'").get();
      if (!table) return false;
      const applied = database.prepare('select name from d1_migrations order by id').all().map((row) => row.name);
      return JSON.stringify(applied) === JSON.stringify(expected);
    } finally {
      database.close();
    }
  });
  if (matches.length !== 1) throw new Error(`Expected one closed, fully migrated local D1 database under ${persistPath}; found ${matches.length}.`);
  return matches[0];
}

export async function applyLocalSeedProfile({ persistPath, profile }: { persistPath: string; profile: string }) {
  const database = new DatabaseSync(locateMigratedDatabase(persistPath));
  try {
  const db = createSQLiteProxy(database);
  const now = new Date();
  const inviteExpiry = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  if (profile === 'all') await applyAllLocalSeeds(db, now, inviteExpiry);
  else if (profile === 'cleanup-test-data') await cleanupTestDataSeed(db);
  else if (profile === 'test-data') await applyTestDataSeed(db, now, inviteExpiry);
  else if (profile === 'official-templates') await applyOfficialTemplatesSeed(db, now);
  else if (profile === 'official-login') await applyOfficialLocalLoginSeed(db, now);
  else throw new Error(`Unknown seed profile: ${profile}`);
    console.log(`PASS typed Drizzle seed profile=${profile} target=local persist=${path.relative(process.cwd(), persistPath)}`);
  } finally {
    database.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.some((argument) => ['--remote', '--preview', '--env'].includes(argument))) {
    throw new Error('Typed seed runner is local-only; remote seeds require the protected D1 API path.');
  }
  await applyLocalSeedProfile({
    profile: valueAfter('--profile') ?? 'all',
    persistPath: path.resolve(valueAfter('--persist-to') ?? '.wrangler/state'),
  });
}
