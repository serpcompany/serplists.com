import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import path from 'node:path';

function writeFilesInto(folder: string, files: Record<string, string>): string {
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(folder, name)), { recursive: true });
    writeFileSync(path.join(folder, name), text);
  }
  return folder;
}

export const aFolderIn = (workDir: string, files: Record<string, string> = {}): string =>
  writeFilesInto(mkdtempSync(path.join(workDir, 'folder-')), files);
