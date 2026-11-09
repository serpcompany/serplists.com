import { copyFileSync, lstatSync, mkdirSync, readdirSync, realpathSync, rmdirSync, statSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { REPO_ROOT } from '../../scripts/lib/run-tool';
import { aCopyOfTheCheckout, type CheckoutCopy } from './checkoutCopy';

type StandInPackage = { name: string; files: Record<string, string> };

export type CopyWithAStandInPackage = CheckoutCopy & { standInFolder: string };

const isALink = (entry: string): boolean => lstatSync(entry).isSymbolicLink() || realpathSync(entry) !== entry;

function unlinkTheLink(link: string): void {
  try {
    unlinkSync(link);
  } catch {
    rmdirSync(link);
  }
}

function linkEveryEntryBut(source: string, target: string, standIn: readonly string[]): void {
  mkdirSync(target, { recursive: true });
  const [kept, ...inside] = standIn;
  for (const entry of readdirSync(source)) {
    const from = path.join(source, entry);
    const to = path.join(target, entry);
    const found = statSync(from, { throwIfNoEntry: false });
    if (entry === kept) {
      if (inside.length > 0) linkEveryEntryBut(from, to, inside);
    } else if (found?.isDirectory()) {
      symlinkSync(realpathSync(from), to, 'junction');
    } else if (found?.isFile()) {
      copyFileSync(from, to);
    }
  }
}

function removeWhatWasLinked(folder: string): void {
  for (const entry of readdirSync(folder)) {
    const each = path.join(folder, entry);
    if (isALink(each)) unlinkTheLink(each);
    else if (lstatSync(each).isDirectory()) removeWhatWasLinked(each);
    else unlinkSync(each);
  }
  rmdirSync(folder);
}

export function aCopyOfTheCheckoutWithAStandInPackage(standIn: StandInPackage): CopyWithAStandInPackage {
  const copy = aCopyOfTheCheckout();
  const nodeModules = path.join(copy.root, 'node_modules');
  if (!lstatSync(nodeModules).isSymbolicLink()) throw new Error(`The copy at ${copy.root} does not link node_modules`);
  unlinkTheLink(nodeModules);
  const packagePath = standIn.name.split('/');
  linkEveryEntryBut(path.join(REPO_ROOT, 'node_modules'), nodeModules, packagePath);
  const standInFolder = path.join(nodeModules, ...packagePath);
  mkdirSync(standInFolder, { recursive: true });
  for (const [file, text] of Object.entries(standIn.files)) writeFileSync(path.join(standInFolder, file), text);
  return {
    root: copy.root,
    standInFolder,
    remove: () => {
      removeWhatWasLinked(nodeModules);
      copy.remove();
    },
  };
}
