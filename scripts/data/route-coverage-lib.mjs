import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import ts from 'typescript';

function files(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(root, entry.name)) : [join(root, entry.name)]);
}

// Conservative server inventory includes every module, including indirect D1
// helpers. Fingerprint query/consumer logic, not ordinary page copy or markup.
// A fingerprint is inventory completeness evidence, never runtime coverage.
export function coverageFingerprint(source, name) {
  if (name.startsWith('src/pages/') || name === 'src/App.tsx') {
    const tree = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const signatures = [];
    const visit = node => {
      if (ts.isImportDeclaration(node) || ts.isCallExpression(node)) signatures.push(node.getText(tree));
      if (ts.isJsxAttribute(node) && node.name.getText(tree) === 'path') signatures.push(node.getText(tree));
      ts.forEachChild(node, visit);
    };
    visit(tree);
    source = signatures.join('\n');
  }
  return createHash('sha256').update(source).digest('hex');
}

export function discoverRouteSurfaces(root) {
  const paths = [...files(join(root, 'functions')), ...files(join(root, 'src'))]
    .filter(path => /\.(?:[cm]?[jt]s|[jt]sx)$/.test(path) && !/\.(test|spec)\./.test(path));
  return paths.flatMap(path => {
    const source = readFileSync(path, 'utf8');
    const name = relative(root, path).split('\\').join('/');
    const kind = name.startsWith('functions/') && /createDb|\.prepare\(|drizzle\(|\.batch\(/.test(source)
      ? 'query-family' : name.startsWith('src/pages/') || name === 'src/App.tsx' || name === 'src/lib/routes.ts' ? 'page'
        : name.startsWith('src/') && /\bapi\.|\bauthClient\.|\buseQuery\(|\buseMutation\(|\bfetch\(/.test(source) ? 'query-consumer'
          : name.startsWith('functions/') ? 'server-module' : null;
    return kind ? [{ path: name, kind, sha256: coverageFingerprint(source, name) }] : [];
  }).sort((a, b) => a.path.localeCompare(b.path));
}

export function discoverRoutePatterns(root) {
  const values = new Map();
  const definitions = ts.createSourceFile('routes.ts', readFileSync(join(root, 'src/lib/routes.ts'), 'utf8'), ts.ScriptTarget.Latest, true);
  const collect = node => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const value = ts.isArrowFunction(node.initializer) ? node.initializer.body : node.initializer;
      if (ts.isStringLiteral(value)) values.set(node.name.text, value.text);
    }
    ts.forEachChild(node, collect);
  };
  collect(definitions);
  const patterns = [];
  const tree = ts.createSourceFile('App.tsx', readFileSync(join(root, 'src/App.tsx'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const visit = node => {
    if (ts.isJsxAttribute(node) && node.name.getText(tree) === 'path') {
      let value = node.initializer;
      if (value && ts.isJsxExpression(value)) value = value.expression;
      const name = value && ts.isCallExpression(value) ? value.expression.getText(tree) : value?.getText(tree);
      const pattern = value && ts.isStringLiteral(value) ? value.text : values.get(name);
      if (!pattern) throw new Error(`Unresolved route expression needs explicit inventory support: ${name}`);
      patterns.push(pattern);
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return [...new Set(patterns)].sort();
}

export function validateRouteInventory(discovered, inventory, routePatterns = []) {
  const errors = [];
  const entries = new Map(inventory.surfaces.map(entry => [entry.path, entry]));
  if (entries.size !== inventory.surfaces.length) errors.push('Duplicate inventory surface');
  for (const surface of discovered) {
    const entry = entries.get(surface.path);
    if (!entry) errors.push(`Uncovered surface: ${surface.path}`);
    else {
      if (entry.sha256 !== surface.sha256) errors.push(`Changed surface needs coverage review: ${surface.path}`);
      if (!entry.scenarios?.length && !entry.notApplicable) errors.push(`No scenario or explicit exclusion: ${surface.path}`);
      for (const scenario of entry.scenarios ?? []) if (!inventory.scenarios.includes(scenario)) errors.push(`Unknown scenario ${scenario}: ${surface.path}`);
      entries.delete(surface.path);
    }
  }
  for (const name of entries.keys()) errors.push(`Stale surface: ${name}`);
  for (const pattern of routePatterns) {
    const routes = (inventory.routes ?? []).filter(route => route.pattern === pattern);
    if (!routes.length) errors.push(`Uncovered route pattern: ${pattern}`);
    for (const route of routes) if (!route.notApplicable && (!route.persona || !route.example || !inventory.scenarios.includes(route.scenario))) errors.push(`Incomplete route expectation: ${pattern}`);
  }
  return errors;
}

export function summarizeRouteEvidence(inventory, observed) {
  return inventory.scenarios.map(name => ({ name, verdict: observed.includes(name) ? 'pass' : 'fail' }));
}
