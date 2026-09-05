import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
export { createRouteQueryRuntime } from './route-query-runtime.mjs';

const QUERY_METHODS = new Set(['select', 'insert', 'update', 'delete', 'batch', 'execute']);
const EXCLUSION_BOUNDARIES = new Set(['package-adapter', 'outbound-provider', 'unrouted-module']);

function digest(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 24);
}

function functionName(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isFunctionDeclaration(current) && current.name) return current.name.text;
    if ((ts.isArrowFunction(current) || ts.isFunctionExpression(current)) && ts.isVariableDeclaration(current.parent) && ts.isIdentifier(current.parent.name)) {
      return current.parent.name.text;
    }
    if (ts.isMethodDeclaration(current) && current.name) return current.name.getText();
  }
  return '<module>';
}

function containingFunction(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isFunctionLike(current)) return current;
  }
  return null;
}

function semanticTokens(node, sourceFile) {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    true,
    sourceFile.languageVariant,
    node.getText(sourceFile),
  );
  const tokens = [];
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    const text = scanner.getTokenText();
    tokens.push(`${token}:${text.length}:${text}`);
  }
  return tokens.join('|');
}

function propertyCallName(node) {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return null;
  return node.expression.name.text;
}

function isQueryRoot(node, lineage) {
  const method = propertyCallName(node);
  if (!method) return false;
  if (method === 'prepare') {
    const receiver = node.expression.expression;
    return (ts.isPropertyAccessExpression(receiver) && receiver.name.text === 'DB') ||
      (ts.isIdentifier(receiver) && lineage.isDatabaseIdentifier(receiver));
  }
  if (!QUERY_METHODS.has(method)) return false;
  const receiver = node.expression.expression;
  if (!ts.isIdentifier(receiver)) return false;
  // select/insert/update/batch/execute are sufficiently database-specific in
  // Worker handlers to discover an injected or renamed database parameter.
  // delete remains restricted to known DB lineage because R2 also has delete.
  return lineage.isDatabaseIdentifier(receiver) || method !== 'delete';
}

function outerQueryChain(root, boundary) {
  let current = root;
  while (current.parent && current !== boundary) {
    const parent = current.parent;
    if (ts.isPropertyAccessExpression(parent) && parent.expression === current) {
      current = parent;
      continue;
    }
    if (ts.isCallExpression(parent) && parent.expression === current) {
      current = parent;
      continue;
    }
    if (ts.isCallExpression(parent) && ts.isPropertyAccessExpression(parent.expression) && parent.expression.expression === current) {
      current = parent;
      continue;
    }
    break;
  }
  return current;
}

function assertSupportedBuilderExecution(root, expression, boundary, sourceFile) {
  if (expression !== root) return;
  let current = root;
  while (current !== boundary && current.parent) {
    const parent = current.parent;
    if (ts.isParenthesizedExpression(parent) || ts.isConditionalExpression(parent) || ts.isArrayLiteralExpression(parent)) {
      current = parent;
      continue;
    }
    if (ts.isCallExpression(parent) && parent.arguments.includes(current)) {
      const callee = parent.expression;
      const supportedPromiseCombinator = ts.isPropertyAccessExpression(callee) &&
        ts.isIdentifier(callee.expression) && callee.expression.text === 'Promise' &&
        ['all', 'allSettled', 'race', 'any'].includes(callee.name.text);
      if (supportedPromiseCombinator) {
        current = parent;
        continue;
      }
      throw new Error(`Unsupported lazy query builder passed through ${callee.getText(sourceFile)} at ${sourceFile.fileName}:${sourceFile.getLineAndCharacterOfPosition(root.getStart(sourceFile)).line + 1}; execute it directly or add a recognized lazy adapter.`);
    }
    break;
  }
}

function queryExpressions(boundary, { skipNestedAwait = false, adapterNames = new Set(), lineage, sourceFile } = {}) {
  const expressions = [];
  const visit = (node) => {
    if (skipNestedAwait && ts.isAwaitExpression(node)) return;
    const adapterRoot = ts.isCallExpression(node) && ts.isIdentifier(node.expression) && adapterNames.has(node.expression.text);
    const builderDefinition = ts.isIdentifier(node) ? lineage.builderDefinition(node) : null;
    const builderRoot = Boolean(builderDefinition) &&
      !(ts.isVariableDeclaration(node.parent) && node.parent.name === node);
    if (isQueryRoot(node, lineage) || adapterRoot || builderRoot) {
      const expression = outerQueryChain(node, boundary);
      if (builderRoot) assertSupportedBuilderExecution(node, expression, boundary, sourceFile);
      expressions.push({
        node: expression,
        semantic: builderDefinition
          ? `${semanticTokens(builderDefinition, sourceFile)}=>${semanticTokens(expression, sourceFile)}`
          : semanticTokens(expression, sourceFile),
      });
      // A D1 batch is the execution unit. Its lazy statement builders must not
      // be wrapped or counted before the batch actually succeeds.
      if (propertyCallName(node) === 'batch') return;
    }
    ts.forEachChild(node, visit);
  };
  visit(boundary);
  return [...new Map(expressions.map((entry) => [`${entry.node.pos}:${entry.node.end}`, entry])).values()];
}

function queryLineage(sourceFile) {
  const declarations = [];
  const declarationsByName = new Map();
  const databaseBindings = new Set();
  const builderDefinitions = new Map();
  function scopeOf(declaration) {
    if (ts.isParameter(declaration)) return declaration.parent;
    for (let current = declaration.parent; current; current = current.parent) {
      if (ts.isBlock(current) || ts.isFunctionLike(current) || ts.isSourceFile(current)) return current;
    }
    return sourceFile;
  }
  function resolveBinding(identifier) {
    const candidates = declarationsByName.get(identifier.text) ?? [];
    return candidates
      .filter((declaration) => {
        const scope = scopeOf(declaration);
        return scope.pos <= identifier.pos && identifier.end <= scope.end &&
          (ts.isParameter(declaration) || declaration.getStart(sourceFile) <= identifier.getStart(sourceFile));
      })
      .sort((left, right) => {
        const leftScope = scopeOf(left);
        const rightScope = scopeOf(right);
        return (leftScope.end - leftScope.pos) - (rightScope.end - rightScope.pos) ||
          right.getStart(sourceFile) - left.getStart(sourceFile);
      })[0] ?? null;
  }
  const collect = (node) => {
    if ((ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isBindingElement(node)) && ts.isIdentifier(node.name)) {
      declarations.push(node);
      const named = declarationsByName.get(node.name.text) ?? [];
      named.push(node);
      declarationsByName.set(node.name.text, named);
    }
    ts.forEachChild(node, collect);
  };
  collect(sourceFile);
  for (const declaration of declarations) {
    if (declaration.name.text === 'db') databaseBindings.add(declaration);
    if (ts.isBindingElement(declaration) &&
      ((declaration.propertyName && ts.isIdentifier(declaration.propertyName) && declaration.propertyName.text === 'DB') ||
        (!declaration.propertyName && declaration.name.text === 'DB'))) databaseBindings.add(declaration);
  }
  const inferReceivers = (node) => {
    const method = propertyCallName(node);
    if (method && (method === 'prepare' || (QUERY_METHODS.has(method) && method !== 'delete')) && ts.isIdentifier(node.expression.expression)) {
      const binding = resolveBinding(node.expression.expression);
      if (binding) databaseBindings.add(binding);
    }
    ts.forEachChild(node, inferReceivers);
  };
  inferReceivers(sourceFile);
  function isDatabaseIdentifier(identifier) {
    const binding = resolveBinding(identifier);
    return identifier.text === 'db' || Boolean(binding && databaseBindings.has(binding));
  }
  function builderDefinition(identifier) {
    const binding = resolveBinding(identifier);
    return binding ? builderDefinitions.get(binding) ?? null : null;
  }
  const lineageApi = { isDatabaseIdentifier, builderDefinition };

  let changed = true;
  while (changed) {
    changed = false;
    for (const declaration of declarations) {
      const initializer = declaration.initializer;
      if (!initializer) continue;
      const initializerBinding = ts.isIdentifier(initializer) ? resolveBinding(initializer) : null;
      const isDatabase =
        (initializerBinding && databaseBindings.has(initializerBinding)) ||
        (ts.isPropertyAccessExpression(initializer) && initializer.name.text === 'DB') ||
        (ts.isCallExpression(initializer) && ts.isIdentifier(initializer.expression) && ['createDb', 'drizzle'].includes(initializer.expression.text));
      if (isDatabase && !databaseBindings.has(declaration)) {
        databaseBindings.add(declaration);
        changed = true;
      }

      let buildsQuery = Boolean(initializerBinding && builderDefinitions.has(initializerBinding));
      const inspect = (node) => {
        if (ts.isAwaitExpression(node) || (node !== initializer && ts.isFunctionLike(node))) return;
        const binding = ts.isIdentifier(node) ? resolveBinding(node) : null;
        if (isQueryRoot(node, lineageApi) || (binding && builderDefinitions.has(binding))) buildsQuery = true;
        ts.forEachChild(node, inspect);
      };
      inspect(initializer);
      if (buildsQuery && !builderDefinitions.has(declaration)) {
        builderDefinitions.set(declaration, initializer);
        changed = true;
      }
    }
  }
  return lineageApi;
}

function lazyQueryAdapterNames(sourceFile, lineage) {
  const names = new Set();
  const visit = (node) => {
    if (ts.isFunctionDeclaration(node) && node.name && !node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword)) {
      let returnsLazyQuery = false;
      const inspect = (child) => {
        if (ts.isReturnStatement(child) && child.expression) {
          returnsLazyQuery ||= queryExpressions(child.expression, { lineage, sourceFile }).some((entry) => propertyCallName(entry.node) !== 'batch');
        }
        ts.forEachChild(child, inspect);
      };
      inspect(node);
      if (returnsLazyQuery) names.add(node.name.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return names;
}

function isEndpointCondition(node) {
  const text = node.getText();
  return /request\.method|(?:\bpath\b|Subpath)(?:\[|\.|\s*[!=]=)/.test(text);
}

function unitId(kind, path, owner, semantic, duplicateIndex) {
  return `${kind}:${digest(`${path}\n${owner}\n${semantic}\n${duplicateIndex}`)}`;
}

export function discoverRouteQueryUnitsFromSource(source, path) {
  const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const lineage = queryLineage(sourceFile);
  const adapterNames = lazyQueryAdapterNames(sourceFile, lineage);
  const candidates = [];
  const visit = (node) => {
    if (ts.isIfStatement(node) && isEndpointCondition(node.expression)) {
      candidates.push({ kind: 'endpoint', node, instrumentNode: node, semantic: semanticTokens(node.expression, sourceFile), owner: functionName(node) });
    }
    if (ts.isAwaitExpression(node)) {
      for (const expression of queryExpressions(node.expression, { lineage, adapterNames, sourceFile })) {
        candidates.push({ kind: 'query', node: expression.node, instrumentNode: expression.node, semantic: expression.semantic, owner: functionName(node) });
      }
    } else if (ts.isReturnStatement(node) && node.expression) {
      const ownerNode = containingFunction(node);
      const ownerIsAsync = Boolean(ownerNode?.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword));
      for (const expression of queryExpressions(node.expression, { lineage, skipNestedAwait: true, adapterNames, sourceFile })) {
        if (ownerIsAsync || propertyCallName(expression.node) === 'batch') {
          candidates.push({ kind: 'query', node: expression.node, instrumentNode: expression.node, semantic: expression.semantic, owner: functionName(node) });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  const duplicates = new Map();
  return candidates
    .sort((a, b) => a.node.getStart(sourceFile) - b.node.getStart(sourceFile) || a.kind.localeCompare(b.kind))
    .map((candidate) => {
      const key = `${candidate.kind}\n${candidate.owner}\n${candidate.semantic}`;
      const duplicateIndex = duplicates.get(key) ?? 0;
      duplicates.set(key, duplicateIndex + 1);
      return {
        id: unitId(candidate.kind, path, candidate.owner, candidate.semantic, duplicateIndex),
        kind: candidate.kind,
        _nodeStart: candidate.instrumentNode.getStart(sourceFile),
        _nodeEnd: candidate.instrumentNode.end,
      };
    });
}

function runtimeAccess(factory) {
  return factory.createPropertyAccessExpression(factory.createIdentifier('globalThis'), '__SERPLISTS_D1_COVERAGE__');
}

export function instrumentRouteQuerySource(source, path) {
  const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const units = discoverRouteQueryUnitsFromSource(source, path);
  const queryByRange = new Map(units.filter((unit) => unit.kind === 'query').map((unit) => [`${unit._nodeStart}:${unit._nodeEnd}`, unit]));
  const endpointByStart = new Map(units.filter((unit) => unit.kind === 'endpoint').map((unit) => [unit._nodeStart, unit]));

  const transformer = (context) => {
    const { factory } = context;
    const visitor = (node) => {
      const query = queryByRange.get(`${node.getStart(sourceFile)}:${node.end}`);
      if (query) {
        const original = ts.visitEachChild(node, visitor, context);
        return factory.createCallExpression(
          factory.createPropertyAccessExpression(runtimeAccess(factory), 'run'),
          undefined,
          [factory.createStringLiteral(query.id), factory.createArrowFunction(undefined, undefined, [], undefined, factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken), original)],
        );
      }
      if (ts.isIfStatement(node)) {
        const visited = ts.visitEachChild(node, visitor, context);
        const endpoint = endpointByStart.get(node.getStart(sourceFile));
        if (!endpoint) return visited;
        const marker = factory.createExpressionStatement(factory.createCallExpression(
          factory.createPropertyAccessExpression(runtimeAccess(factory), 'hit'),
          undefined,
          [factory.createStringLiteral(endpoint.id)],
        ));
        const statement = ts.isBlock(visited.thenStatement)
          ? factory.updateBlock(visited.thenStatement, [marker, ...visited.thenStatement.statements])
          : factory.createBlock([marker, visited.thenStatement], true);
        return factory.updateIfStatement(visited, visited.expression, statement, visited.elseStatement);
      }
      return ts.visitEachChild(node, visitor, context);
    };
    return (root) => ts.visitNode(root, visitor);
  };
  const result = ts.transform(sourceFile, [transformer]);
  try {
    const code = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed }).printFile(result.transformed[0]);
    return { code, units: units.map(({ _nodeStart, _nodeEnd, ...unit }) => unit) };
  } finally {
    result.dispose();
  }
}

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? sourceFiles(join(directory, entry.name)) : [join(directory, entry.name)],
  );
}

export function discoverRouteQueryUnits(root) {
  return sourceFiles(join(root, 'functions'))
    .filter((file) => /\.[cm]?[jt]sx?$/.test(file) && !/\.(?:test|spec)\./.test(file))
    .flatMap((file) => {
      const path = relative(root, file).split('\\').join('/');
      return discoverRouteQueryUnitsFromSource(readFileSync(file, 'utf8'), path);
    })
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(({ _nodeStart, _nodeEnd, ...unit }) => unit);
}

export function routeQuerySourceDigest(units) {
  return createHash('sha256')
    .update(JSON.stringify(units.map(({ id, kind }) => ({ id, kind })).sort((a, b) => a.id.localeCompare(b.id))))
    .digest('hex');
}

export function createRouteQueryInstrumentationPlugin({ repoRoot }) {
  const functionsRoot = join(repoRoot, 'functions');
  return {
    name: 'serplists-route-query-coverage',
    setup(build) {
      build.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, (args) => {
        if (args.path !== functionsRoot && !args.path.startsWith(`${functionsRoot}/`)) return null;
        const path = relative(repoRoot, args.path).split('\\').join('/');
        const { code } = instrumentRouteQuerySource(readFileSync(args.path, 'utf8'), path);
        return { contents: code, loader: args.path.endsWith('x') ? 'tsx' : 'ts' };
      });
    },
  };
}

export function evaluateRouteQueryUnitCoverage(discovered, observed, exclusions = []) {
  const expected = new Map(discovered.map((unit) => [unit.id, unit]));
  const excluded = new Set(exclusions.map((entry) => entry.id));
  const outcomes = new Map();
  const errors = [];
  for (const entry of observed) {
    if (!expected.has(entry.id)) {
      errors.push({ code: 'unmapped-runtime-unit', id: entry.id });
      continue;
    }
    if (entry.outcome === 'success' || !outcomes.has(entry.id)) outcomes.set(entry.id, entry.outcome);
  }
  for (const exclusion of exclusions) {
    if (!expected.has(exclusion.id)) errors.push({ code: 'stale-exclusion', id: exclusion.id });
    if (!EXCLUSION_BOUNDARIES.has(exclusion.boundary) || typeof exclusion.proof !== 'string' || exclusion.proof.length < 8) {
      errors.push({ code: 'unjustified-exclusion', id: exclusion.id });
    }
  }
  const units = discovered.map((unit) => {
    const outcome = outcomes.get(unit.id);
    const status = excluded.has(unit.id) ? 'excluded' : outcome === 'success' ? 'executed' : outcome === 'error' ? 'failed' : 'missing';
    return { id: unit.id, kind: unit.kind, status };
  });
  if (units.some((unit) => unit.status === 'missing')) errors.push({ code: 'missing-runtime-unit' });
  if (units.some((unit) => unit.status === 'failed')) errors.push({ code: 'failed-runtime-unit' });
  return {
    verdict: errors.length === 0 ? 'pass' : 'fail',
    counts: {
      discovered: units.length,
      executed: units.filter((unit) => unit.status === 'executed').length,
      excluded: units.filter((unit) => unit.status === 'excluded').length,
      missing: units.filter((unit) => unit.status === 'missing').length,
      failed: units.filter((unit) => unit.status === 'failed').length,
    },
    units,
    errors,
  };
}
