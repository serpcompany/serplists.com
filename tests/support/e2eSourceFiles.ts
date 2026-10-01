import { readdirSync } from 'node:fs';
import path from 'node:path';

const E2E_DIR = path.join('tests', 'e2e');

export function e2eSourceFiles() {
  return readdirSync(E2E_DIR, { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith('.ts'))
    .map((name) => path.join(E2E_DIR, name).split(path.sep).join('/'))
    .sort();
}
