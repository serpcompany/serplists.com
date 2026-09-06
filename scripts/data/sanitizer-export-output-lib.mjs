import { constants, closeSync, fstatSync, fsyncSync, ftruncateSync, lstatSync, mkdirSync, openSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const same = (a, b) => a.dev === b.dev && a.ino === b.ino;
const stat = value => {
  try { return lstatSync(value); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
};

// Preflight is read-only. In particular, a rejected second destination must not
// acquire the first one. Every existing ancestor is checked, including tmp.
export function preflightExportDestination(repoRoot, value, relativeRoot) {
  const root = realpathSync(repoRoot);
  if (!value || value.includes('\0')) throw new Error('Invalid export destination.');
  const destination = path.resolve(root, value);
  const allowed = path.join(root, relativeRoot);
  if (!destination.startsWith(`${allowed}${path.sep}`)) throw new Error('Invalid export destination.');
  const parents = [];
  let current = root;
  for (const part of path.relative(root, path.dirname(destination)).split(path.sep)) {
    current = path.join(current, part);
    const identity = stat(current);
    if (identity && (!identity.isDirectory() || identity.isSymbolicLink())) throw new Error('Unsafe export ancestor.');
    parents.push({ path: current, identity });
  }
  if (stat(destination)) throw new Error('Export destination already exists.');
  return { destination, parents };
}

export function acquireExportDestination(plan) {
  for (const parent of plan.parents) {
    if (!parent.identity) {
      // No recursive mkdir: a raced-in directory is not adopted.
      mkdirSync(parent.path, { mode: 0o700 });
      parent.identity = lstatSync(parent.path);
    }
    const now = lstatSync(parent.path);
    if (!now.isDirectory() || !same(parent.identity, now)) throw new Error('Export ancestor changed.');
  }
  const fd = openSync(plan.destination, constants.O_CREAT | constants.O_EXCL | constants.O_RDWR | constants.O_NOFOLLOW, 0o600);
  const identity = fstatSync(fd);
  const verify = () => {
    for (const parent of plan.parents) {
      const now = lstatSync(parent.path);
      if (!now.isDirectory() || !same(parent.identity, now)) throw new Error('Export ancestor changed.');
    }
    const now = lstatSync(plan.destination);
    const held = fstatSync(fd);
    if (!now.isFile() || !same(identity, now) || held.nlink !== 1 || (held.mode & 0o777) !== 0o600) throw new Error('Export allocation changed.');
  };
  return {
    fd,
    verify,
    write(bytes) { verify(); writeFileSync(fd, bytes); fsyncSync(fd); verify(); },
    // Node has no atomic compare-and-unlink. Clear only the held inode, never
    // unlink a pathname which another process could replace after a check.
    clear() { ftruncateSync(fd, 0); fsyncSync(fd); if (fstatSync(fd).size !== 0) throw new Error('Export cleanup unverified.'); },
    close() { closeSync(fd); },
  };
}
