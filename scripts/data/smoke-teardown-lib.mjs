import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Paths are not ownership: only an exclusive allocation can mint this capability.
const allocations = new WeakMap();
const identity = stat => `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`;

function inspect(candidate, { tree = false } = {}) {
  for (let current = candidate; ; current = path.dirname(current)) {
    if (lstatSync(current).isSymbolicLink()) throw new Error('Refusing symlink smoke cleanup path');
    if (path.dirname(current) === current) break;
  }
  if (tree && lstatSync(candidate).isDirectory()) {
    for (const name of readdirSync(candidate)) inspect(path.join(candidate, name), { tree: true });
  }
}

export function createSmokeWorkspace({ repoRoot }) {
  repoRoot = realpathSync(repoRoot);
  const parent = path.join(repoRoot, '.wrangler');
  let createdParent = false;
  try { mkdirSync(parent); createdParent = true; } catch (error) { if (error.code !== 'EEXIST') throw error; }
  inspect(parent);
  const parentIdentity = identity(lstatSync(parent));
  try {
    const root = mkdtempSync(path.join(parent, 'smoke-invocation-'));
    const workspace = Object.freeze({
      root, statePath: path.join(root, 'state'),
      transientPaths: Object.freeze([root]),
      workerPath: path.join(root, 'pages/_worker.js'),
    });
    allocations.set(workspace, { repoRoot, parent, parentIdentity, createdParent, rootIdentity: identity(lstatSync(root)), removed: false });
    return workspace;
  } catch (error) {
    if (createdParent) rmdirSync(parent);
    throw error;
  }
}

export function cleanupSmokeState({ repoRoot, statePath, transientPaths = [], reportPath, ownership,
  remove = target => rmSync(target, { recursive: true, force: true }),
}) {
  const allocation = allocations.get(ownership);
  if (!allocation || realpathSync(repoRoot) !== allocation.repoRoot || statePath !== ownership.statePath ||
      transientPaths.length !== 1 || transientPaths[0] !== ownership.root) {
    throw new Error('Refusing smoke cleanup without exact invocation ownership');
  }
  const resolvedReport = path.resolve(reportPath);
  const reportRoot = path.join(allocation.repoRoot, 'tmp/data-reports');
  let reportError;
  try {
    if (!resolvedReport.startsWith(reportRoot + path.sep)) throw new Error('Smoke teardown report must stay under tmp/data-reports/');
    for (let current = resolvedReport; current !== path.dirname(current); current = path.dirname(current)) {
      try { if (lstatSync(current).isSymbolicLink()) throw new Error('Refusing symlink smoke report path'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  } catch (error) { reportError = error; }
  const existedBefore = existsSync(statePath);
  const errors = [];
  try {
    let parentStat;
    try { parentStat = lstatSync(allocation.parent); } catch (error) { if (error.code !== 'ENOENT' || !allocation.removed) throw error; }
    if (parentStat) {
      if (identity(parentStat) !== allocation.parentIdentity) throw new Error('Smoke parent ownership changed');
      inspect(allocation.parent);
      let stat;
      try { stat = lstatSync(ownership.root); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (stat) {
        if (allocation.removed || identity(stat) !== allocation.rootIdentity) throw new Error('Smoke invocation ownership changed');
        inspect(ownership.root, { tree: true });
        remove(ownership.root);
      }
      allocation.removed = !existsSync(ownership.root);
      if (allocation.createdParent && allocation.removed) {
        try { rmdirSync(allocation.parent); }
        catch (error) { if (!['ENOTEMPTY', 'EEXIST'].includes(error.code)) throw error; }
      }
    }
  } catch (error) { errors.push(error.message); }
  const existsAfter = existsSync(statePath);
  const remaining = transientPaths.filter(candidate => {
    try { lstatSync(candidate); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  });
  const report = {
    check: 'browser-smoke-teardown', stateIdentity: path.relative(repoRoot, statePath),
    existedBefore, existsAfter,
    transientIdentities: transientPaths.map(candidate => path.relative(repoRoot, candidate)),
    remainingTransientIdentities: remaining.map(candidate => path.relative(repoRoot, candidate)),
    leakedStatePaths: Number(existsAfter) + remaining.length,
    errors, verdict: existsAfter || remaining.length || errors.length ? 'fail' : 'pass',
  };
  // A reporting failure must not skip owned resource cleanup. Surface its
  // observed outcome in the thrown error when no safe report can be written.
  if (reportError) throw new Error(`${reportError.message}; cleanup verdict=${report.verdict}, leakedStatePaths=${report.leakedStatePaths}`);
  mkdirSync(path.dirname(resolvedReport), { recursive: true });
  writeFileSync(resolvedReport, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}
