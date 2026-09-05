import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import ts from 'typescript';
export { createRouteQueryRuntime } from './route-query-runtime.mjs';

const QUERY_METHODS = new Set(['select', 'insert', 'update', 'delete', 'batch', 'execute', 'exec', 'findMany', 'findFirst', 'all', 'get', 'run', 'values']);
const EAGER_METHODS = new Set(['exec', 'execute', 'batch', 'all', 'get', 'run', 'raw', 'first', 'values']);
const BUILDER_METHODS = new Set(['from', 'where', 'limit', 'offset', 'orderBy', 'groupBy', 'having',
  'leftJoin', 'rightJoin', 'innerJoin', 'fullJoin', 'crossJoin', 'set', 'values', 'select', 'returning',
  'onConflictDoNothing', 'onConflictDoUpdate', 'bind', '$dynamic', 'union', 'unionAll', 'intersect', 'except']);
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

function isAccess(node) {
  return ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node);
}

function isErasedExpressionWrapper(node) {
  return ts.isParenthesizedExpression(node) || ts.isAsExpression(node) ||
    ts.isTypeAssertionExpression(node) || ts.isSatisfiesExpression(node) || ts.isNonNullExpression(node) || ts.isExpressionWithTypeArguments(node);
}

function importedDatabaseAdapters(sourceFile) {
  const adapters = new Map();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteralLike(statement.moduleSpecifier) || statement.importClause?.isTypeOnly) continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      if (element.isTypeOnly) continue;
      const exported = (element.propertyName ?? element.name).text;
      if (statement.moduleSpecifier.text === 'drizzle-orm/d1' && exported === 'drizzle') adapters.set(element.name.text, 'factory');
      if (statement.moduleSpecifier.text === 'better-auth/adapters/drizzle' && exported === 'drizzleAdapter') adapters.set(element.name.text, 'consumer');
    }
  }
  return adapters;
}

function accessName(node) {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression)) return node.argumentExpression.text;
  return null;
}

function propertyCallName(node) {
  return ts.isCallExpression(node) ? accessName(node.expression) : null;
}

function isPromiseConsumer(node) {
  return ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) && node.expression.expression.text === 'Promise' &&
    ['all', 'allSettled', 'race', 'any', 'resolve'].includes(node.expression.name.text);
}

function isQueryRoot(node, lineage) {
  const method = propertyCallName(node);
  if (!method) return false;
  if (method === 'prepare') return lineage.isDatabaseExpression(node.expression.expression);
  if (!QUERY_METHODS.has(method)) return false;
  const receiver = node.expression.expression;
  // select/insert/update/batch/execute are sufficiently database-specific in
  // Worker handlers to discover an injected or renamed database parameter.
  // delete remains restricted to known DB lineage because R2 also has delete.
  return lineage.isDatabaseExpression(receiver) ||
    (ts.isIdentifier(receiver) && ['select', 'insert', 'update', 'batch', 'execute', 'exec'].includes(method));
}

function outerQueryChain(root, boundary) {
  let current = root;
  while (current.parent && current !== boundary) {
    const parent = current.parent;
    if (isAccess(parent) && parent.expression === current) {
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
  let current = expression;
  while (current !== boundary && current.parent) {
    const parent = current.parent;
    if (ts.isParenthesizedExpression(parent) || ts.isConditionalExpression(parent) || ts.isArrayLiteralExpression(parent)) {
      current = parent;
      continue;
    }
    if (ts.isCallExpression(parent) && parent.arguments.includes(current)) {
      const callee = parent.expression;
      if (isPromiseConsumer(parent) || propertyCallName(parent) === 'batch') {
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
    if (ts.isFunctionLike(node)) return;
    if (skipNestedAwait && ts.isAwaitExpression(node)) return;
    const adapterRoot = ts.isCallExpression(node) && ts.isIdentifier(node.expression) && adapterNames.has(node.expression.text);
    const builderDefinition = ts.isIdentifier(node) ? lineage.builderDefinition(node) : null;
    const builderRoot = Boolean(builderDefinition) && !lineage.isExecutedResult(node) &&
      !(ts.isVariableDeclaration(node.parent) && node.parent.name === node);
    if (isQueryRoot(node, lineage) || adapterRoot || builderRoot) {
      const expression = outerQueryChain(node, boundary);
      if (builderRoot) {
        let definition = builderDefinition;
        const seen = new Set();
        while (!seen.has(definition)) {
          seen.add(definition);
          if (ts.isParenthesizedExpression(definition) || ts.isAsExpression(definition) || ts.isNonNullExpression(definition)) definition = definition.expression;
          else if (ts.isIdentifier(definition) && lineage.builderDefinition(definition)) definition = lineage.builderDefinition(definition);
          else break;
        }
        if (ts.isFunctionLike(definition)) {
          throw new Error(`Unsupported database execution through function-valued builder alias at ${sourceFile.fileName}:${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1}; use a named function declaration with one query origin.`);
        }
        if (ts.isArrayLiteralExpression(definition) || ts.isConditionalExpression(definition)) {
          throw new Error(`Unsupported database execution through aggregate builder alias at ${sourceFile.fileName}:${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1}; consume individual query branches directly.`);
        }
        assertSupportedBuilderExecution(node, expression, boundary, sourceFile);
      }
      expressions.push({
        node: expression,
        semantic: builderDefinition
          ? `${lineage.builderSemantic(node)}=>${semanticTokens(expression, sourceFile)}`
          : adapterRoot
            ? `${semanticTokens(adapterNames.get(node.expression.text), sourceFile)}=>${semanticTokens(expression, sourceFile)}`
            : semanticTokens(expression, sourceFile),
      });
      // Discover batch execution here; its selected lazy statement origins are
      // analyzed separately and earn coverage only after the batch succeeds.
      if (propertyCallName(node) === 'batch') return;
    }
    ts.forEachChild(node, visit);
  };
  visit(boundary);
  return [...new Map(expressions.map((entry) => [`${entry.node.pos}:${entry.node.end}`, entry])).values()];
}

function queryLineage(sourceFile, adapterNames = new Set()) {
  const packageAdapters = importedDatabaseAdapters(sourceFile);
  const declarations = [];
  const declarationsByName = new Map();
  const databaseBindings = new Set();
  const builderDefinitions = new Map();
  const executedBindings = new Set();
  const environmentBindings = new Set();
  function scopeOf(declaration) {
    if (ts.isParameter(declaration)) return declaration.parent;
    for (let current = declaration.parent; current; current = current.parent) {
      if (ts.isBlock(current) || ts.isFunctionLike(current) || ts.isSourceFile(current) ||
        ts.isForStatement(current) || ts.isForInStatement(current) || ts.isForOfStatement(current) ||
        ts.isCaseBlock(current) || ts.isCatchClause(current)) return current;
    }
    return sourceFile;
  }
  function resolveBinding(identifier, includeLater = false) {
    const candidates = declarationsByName.get(identifier.text) ?? [];
    return candidates
      .filter((declaration) => {
        const scope = scopeOf(declaration);
        return scope.pos <= identifier.pos && identifier.end <= scope.end &&
          (includeLater || ts.isParameter(declaration) || declaration.getStart(sourceFile) <= identifier.getStart(sourceFile));
      })
      .sort((left, right) => {
        const leftScope = scopeOf(left);
        const rightScope = scopeOf(right);
        return (leftScope.end - leftScope.pos) - (rightScope.end - rightScope.pos) ||
          right.getStart(sourceFile) - left.getStart(sourceFile);
      })[0] ?? null;
  }
  const collect = (node) => {
    if ((ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isBindingElement(node) || ts.isFunctionDeclaration(node)) && node.name && ts.isIdentifier(node.name)) {
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
    let receiver = method ? node.expression.expression : null;
    if (['findMany', 'findFirst'].includes(method)) {
      while (receiver && isAccess(receiver)) receiver = receiver.expression;
    }
    if (method && ['prepare', 'select', 'insert', 'update', 'batch', 'execute', 'exec', 'findMany', 'findFirst'].includes(method) && ts.isIdentifier(receiver)) {
      const binding = resolveBinding(receiver);
      if (binding) databaseBindings.add(binding);
    }
    ts.forEachChild(node, inferReceivers);
  };
  inferReceivers(sourceFile);
  function isDatabaseIdentifier(identifier) {
    const binding = resolveBinding(identifier);
    return binding ? databaseBindings.has(binding) : identifier.text === 'db' && !packageAdapters.has(identifier.text);
  }
  function builderDefinition(identifier) {
    const binding = resolveBinding(identifier);
    return binding ? builderDefinitions.get(binding) ?? null : null;
  }
  function isDatabaseExpression(node) {
    if (ts.isIdentifier(node)) return isDatabaseIdentifier(node);
    if (isErasedExpressionWrapper(node) || ts.isAwaitExpression(node)) return isDatabaseExpression(node.expression);
    if (isAccess(node)) return bindingAccessName(node) === 'DB' || isDatabaseExpression(node.expression);
    return ts.isCallExpression(node) && ts.isIdentifier(node.expression) &&
      (node.expression.text === 'createDb' ||
        (!resolveBinding(node.expression) && packageAdapters.get(node.expression.text) === 'factory'));
  }
  function staticBindingName(node, seen = new Set()) {
    if (ts.isStringLiteralLike(node)) return node.text;
    if (isErasedExpressionWrapper(node)) return staticBindingName(node.expression, seen);
    if (ts.isIdentifier(node)) {
      const binding = resolveBinding(node, true);
      if (!binding || seen.has(binding) || !ts.isVariableDeclaration(binding) ||
        binding.getStart(sourceFile) > node.getStart(sourceFile) ||
        !ts.isVariableDeclarationList(binding.parent) || !(binding.parent.flags & ts.NodeFlags.Const) || !binding.initializer) return null;
      return staticBindingName(binding.initializer, new Set([...seen, binding]));
    }
    if (ts.isTemplateExpression(node)) {
      let value = node.head.text;
      for (const span of node.templateSpans) {
        const part = staticBindingName(span.expression, seen);
        if (part === null) return null;
        value += part + span.literal.text;
      }
      return value;
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const left = staticBindingName(node.left, seen);
      const right = staticBindingName(node.right, seen);
      return left !== null && right !== null ? left + right : null;
    }
    return null;
  }
  function bindingAccessName(node) {
    return ts.isElementAccessExpression(node) ? staticBindingName(node.argumentExpression) : accessName(node);
  }
  // Resolve only literal, immutable lexical inputs. Parameter defaults are not
  // their supplied values; unresolved extractions must remain potentially D1.
  function literalBindingValue(binding, seen) {
    if (!binding || seen.has(binding)) return null;
    const next = new Set([...seen, binding]);
    if (ts.isVariableDeclaration(binding)) {
      return ts.isVariableDeclarationList(binding.parent) && (binding.parent.flags & ts.NodeFlags.Const) && binding.initializer
        ? literalValue(binding.initializer, next) : null;
    }
    if (!ts.isBindingElement(binding) || binding.dotDotDotToken) return null;
    const input = literalBindingValue(binding.parent.parent, next);
    if (!input) return null;
    let value;
    if (ts.isObjectBindingPattern(binding.parent) && ts.isObjectLiteralExpression(input)) {
      const key = binding.propertyName ?? binding.name;
      const name = ts.isComputedPropertyName(key) ? staticBindingName(key.expression)
        : ts.isIdentifier(key) || ts.isStringLiteralLike(key) ? key.text : null;
      if (name === null) return null;
      for (const property of input.properties) {
        if (!ts.isPropertyAssignment(property) || ts.isComputedPropertyName(property.name) ||
          !(ts.isIdentifier(property.name) || ts.isStringLiteralLike(property.name)) || property.name.text === '__proto__') return null;
        if (property.name.text === name) value = property.initializer;
      }
    } else if (ts.isArrayBindingPattern(binding.parent) && ts.isArrayLiteralExpression(input) &&
      !input.elements.some(ts.isSpreadElement)) {
      value = input.elements[binding.parent.elements.indexOf(binding)];
      if (value && ts.isOmittedExpression(value)) value = undefined;
    } else return null;
    // Only a proven absent literal property/slot selects the default.
    return value ? literalValue(value, next) : binding.initializer ? literalValue(binding.initializer, next) : null;
  }
  function literalValue(node, seen) {
    if (isErasedExpressionWrapper(node)) return literalValue(node.expression, seen);
    if (ts.isIdentifier(node)) {
      const binding = resolveBinding(node, true);
      if (!binding || !hasOnlyLocalReads(binding)) return null;
      return literalBindingValue(binding, seen);
    }
    return node;
  }
  function hasOnlyLocalReads(binding, seen = new Set()) {
    if (seen.has(binding)) return false;
    const next = new Set([...seen, binding]);
    let safe = true;
    const visit = node => {
      if (!safe) return;
      if (ts.isIdentifier(node) && node !== binding.name && resolveBinding(node, true) === binding &&
        !(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node) &&
        !(ts.isPropertyAssignment(node.parent) && node.parent.name === node) &&
        !(ts.isBindingElement(node.parent) && node.parent.propertyName === node)) {
        let value = node;
        while ((isAccess(value.parent) || isErasedExpressionWrapper(value.parent)) && value.parent.expression === value) value = value.parent;
        const parent = value.parent;
        const alias = ts.isVariableDeclaration(parent) && parent.initializer === value &&
          ts.isVariableDeclarationList(parent.parent) && (parent.parent.flags & ts.NodeFlags.Const);
        const read = value !== node && (ts.isReturnStatement(parent) || ts.isExpressionStatement(parent));
        if (!alias && !read) safe = false;
        if (alias) {
          const inspectAlias = declaration => {
            if (ts.isIdentifier(declaration.name)) {
              if (!hasOnlyLocalReads(declaration, next)) safe = false;
            } else for (const element of declaration.name.elements) {
              if (ts.isBindingElement(element)) inspectAlias(element);
            }
          };
          inspectAlias(parent);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return safe;
  }
  function isBenignLiteral(node, seen = new Set()) {
    if (!node) return false;
    const value = literalValue(node, seen);
    if (!value) return false;
    if (ts.isStringLiteralLike(value) || ts.isNumericLiteral(value) ||
      [ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(value.kind)) return true;
    if (ts.isArrayLiteralExpression(value)) return value.elements.every(element => isBenignLiteral(element, seen));
    if (ts.isObjectLiteralExpression(value)) return value.properties.every(property =>
      ts.isPropertyAssignment(property) && !ts.isComputedPropertyName(property.name) &&
      (ts.isIdentifier(property.name) || ts.isStringLiteralLike(property.name)) &&
      !['DB', 'env', '__proto__'].includes(property.name.text) && isBenignLiteral(property.initializer, seen));
    return false;
  }
  function isEnvironmentExpression(node, seen = new Set()) {
    if (isErasedExpressionWrapper(node)) return isEnvironmentExpression(node.expression, seen);
    if (isAccess(node)) return bindingAccessName(node) === 'env';
    if (!ts.isIdentifier(node)) return false;
    if (node.text === 'env') return true;
    const binding = resolveBinding(node, true);
    if (environmentBindings.has(binding)) return true;
    if (!binding || seen.has(binding)) return false;
    // Destructured values come from the enclosing pattern's input, not their
    // own initializer (which is only a default). Until that extraction is
    // proven, an unknown key may select D1: reject before it escapes in a bag,
    // including parameter, nested, default and rest binding patterns.
    if (ts.isBindingElement(binding)) return !hasOnlyLocalReads(binding) || !isBenignLiteral(literalBindingValue(binding, seen));
    if (!binding.initializer) return false;
    return isEnvironmentExpression(binding.initializer, new Set([...seen, binding]));
  }
  function hasEnvironmentOrigin(node, seen = new Set()) {
    if (isErasedExpressionWrapper(node)) return hasEnvironmentOrigin(node.expression, seen);
    if (isAccess(node)) return bindingAccessName(node) === 'env';
    if (!ts.isIdentifier(node)) return false;
    const binding = resolveBinding(node, true);
    if (!binding) return node.text === 'env';
    if (environmentBindings.has(binding)) return true;
    if (seen.has(binding)) return false;
    const next = new Set([...seen, binding]);
    if (ts.isParameter(binding) && node.text === 'env') return true;
    if (ts.isParameter(binding) && ts.isFunctionLike(binding.parent)) {
      const owner = binding.parent;
      const ownerBinding = ts.isFunctionDeclaration(owner) ? owner
        : ts.isVariableDeclaration(owner.parent) && owner.parent.initializer === owner ? owner.parent : null;
      const index = owner.parameters.indexOf(binding);
      let forwarded = false;
      const resolvesToOwner = (callee, aliases = new Set()) => {
        if (isErasedExpressionWrapper(callee)) return resolvesToOwner(callee.expression, aliases);
        if (callee === owner) return true;
        if (!ts.isIdentifier(callee)) return false;
        const target = resolveBinding(callee, true);
        if (ownerBinding && target === ownerBinding) return true;
        if (!target || aliases.has(target) || !target.initializer) return false;
        return resolvesToOwner(target.initializer, new Set([...aliases, target]));
      };
      const inspect = child => {
        if (ts.isCallExpression(child) && resolvesToOwner(child.expression) && child.arguments[index] &&
          hasEnvironmentOrigin(child.arguments[index], next)) forwarded = true;
        if (!forwarded) ts.forEachChild(child, inspect);
      };
      inspect(sourceFile);
      if (forwarded) return true;
    }
    if (ts.isBindingElement(binding)) {
      for (let ancestor = binding.parent.parent; ts.isBindingElement(ancestor); ancestor = ancestor.parent.parent) {
        const key = ancestor.propertyName ?? ancestor.name;
        const name = ts.isComputedPropertyName(key) ? staticBindingName(key.expression)
          : ts.isIdentifier(key) || ts.isStringLiteralLike(key) ? key.text : null;
        if (name === 'env') return true;
      }
      const key = binding.propertyName ?? binding.name;
      const name = ts.isComputedPropertyName(key) ? staticBindingName(key.expression)
        : ts.isIdentifier(key) || ts.isStringLiteralLike(key) ? key.text : null;
      if (name === 'env') return true;
      const input = binding.parent.parent;
      if (input.initializer && hasEnvironmentOrigin(input.initializer, next)) return true;
      const extracted = literalBindingValue(binding, seen);
      if (extracted && hasEnvironmentOrigin(extracted, next)) return true;
    }
    return Boolean(binding.initializer && hasEnvironmentOrigin(binding.initializer, next));
  }
  function builderSemantic(identifier, seen = new Set()) {
    const binding = resolveBinding(identifier);
    const definition = binding && builderDefinitions.get(binding);
    if (!definition || seen.has(binding)) return '';
    seen.add(binding);
    const dependencies = [];
    const visit = (node) => {
      if (ts.isIdentifier(node)) {
        const semantic = builderSemantic(node, seen);
        if (semantic) dependencies.push(semantic);
        const adapter = adapterNames.get?.(node.text);
        if (adapter) dependencies.push(semanticTokens(adapter, sourceFile));
      }
      ts.forEachChild(node, visit);
    };
    visit(definition);
    return [...dependencies, semanticTokens(definition, sourceFile)].join('=>');
  }
  const lineageApi = { isDatabaseIdentifier, isDatabaseExpression, builderDefinition, builderSemantic, resolveBinding,
    bindingAccessName, staticBindingName, isEnvironmentExpression, hasEnvironmentOrigin,
    markEnvironmentBinding: binding => environmentBindings.add(binding),
    isExecutedResult: (identifier) => executedBindings.has(resolveBinding(identifier)) };

  let changed = true;
  while (changed) {
    changed = false;
    for (const declaration of declarations) {
      const initializer = declaration.initializer;
      if (!initializer) continue;
      const initializerBinding = ts.isIdentifier(initializer) ? resolveBinding(initializer) : null;
      const isDatabase = isDatabaseExpression(initializer);
      if (isDatabase && !databaseBindings.has(declaration)) {
        databaseBindings.add(declaration);
        changed = true;
      }

      let buildsQuery = Boolean(initializerBinding && builderDefinitions.has(initializerBinding));
      const inspect = (node) => {
        if (ts.isAwaitExpression(node) || (node !== initializer && ts.isFunctionLike(node))) return;
        const binding = ts.isIdentifier(node) ? resolveBinding(node) : null;
        if (isQueryRoot(node, lineageApi) || (binding && builderDefinitions.has(binding)) ||
          (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && adapterNames.has(node.expression.text))) buildsQuery = true;
        ts.forEachChild(node, inspect);
      };
      inspect(initializer);
      if (buildsQuery && !builderDefinitions.has(declaration)) {
        builderDefinitions.set(declaration, initializer);
        changed = true;
      }
      const method = propertyCallName(initializer);
      if (!executedBindings.has(declaration) && ((initializerBinding && executedBindings.has(initializerBinding)) ||
        (buildsQuery && isPromiseConsumer(initializer)) ||
        (buildsQuery && EAGER_METHODS.has(method) && (method !== 'values' || isDatabaseExpression(initializer.expression.expression))))) {
        executedBindings.add(declaration);
        changed = true;
      }
    }
  }
  return lineageApi;
}

// Discovery must reject execution syntax it cannot preserve, including code in
// branches the current fixtures never enter. This is a syntax boundary, not a
// coverage exclusion. In particular .then can recover query failures or execute
// synchronously; treating its returned value as query success would be unsound.
function assertSupportedDatabaseCalls(sourceFile, lineage, adapterNames, audit = { modules: new Map(), active: new Set(), verified: new Set() }, boundary = sourceFile) {
  const failHandle = node => {
    throw new Error(`Unsupported database handle transfer at ${sourceFile.fileName}:${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1}; keep a direct database alias and directly consume queries.`);
  };
  // The same resolved import mapping owns both accepted input handles and
  // factory output lineage, including `import { drizzle as makeDb }`.
  const packageAdapters = importedDatabaseAdapters(sourceFile);
  const localImports = new Map();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteralLike(statement.moduleSpecifier) ||
      !statement.moduleSpecifier.text.startsWith('.') || statement.importClause?.isTypeOnly) continue;
    const imports = statement.importClause?.namedBindings;
    if (imports && ts.isNamedImports(imports)) for (const element of imports.elements) {
      if (!element.isTypeOnly) localImports.set(element.name.text, { module: statement.moduleSpecifier.text, name: (element.propertyName ?? element.name).text });
    }
  }
  const failEnvCall = () => {
    throw new Error(`Unsupported database environment call at ${sourceFile.fileName}; Env requires a proven consumer and parameter.`);
  };
  const stableCallable = (file, scope, binding) => {
    let stable = true;
    const inspect = node => {
      if (ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
        node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) {
        const left = child => {
          if (ts.isIdentifier(child) && scope.resolveBinding(child, true) === binding) stable = false;
          ts.forEachChild(child, left);
        };
        left(node.left);
      }
      ts.forEachChild(node, inspect);
    };
    inspect(file);
    return stable;
  };
  // A dependency override is not a consumer proof. The sole reducible case is
  // an empty default whose argument is omitted at every audited Functions call
  // site. Public Worker entrypoints and unknown/escaping references fail closed.
  const provesEmptyDefault = parameter => {
    const owner = parameter.parent;
    if (!ts.isFunctionDeclaration(owner) || !owner.name || owner.name.text === 'onRequest' ||
      owner.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword) ||
      !parameter.initializer || !ts.isObjectLiteralExpression(parameter.initializer) || parameter.initializer.properties.length) return false;
    const filename = resolve(sourceFile.fileName);
    const functionsRoot = resolve('functions');
    if (!filename.startsWith(`${functionsRoot}/`)) return false;
    try { if (readFileSync(filename, 'utf8') !== sourceFile.text) return false; } catch { return false; }
    let untouched = true;
    const inspectDefaultUses = node => {
      if (ts.isIdentifier(node) && lineage.resolveBinding(node, true) === parameter) {
        const member = node.parent;
        const fallback = member.parent;
        if (!ts.isPropertyAccessExpression(member) || member.expression !== node ||
          !ts.isBinaryExpression(fallback) || fallback.left !== member || fallback.operatorToken.kind !== ts.SyntaxKind.QuestionQuestionToken) untouched = false;
      }
      ts.forEachChild(node, inspectDefaultUses);
    };
    inspectDefaultUses(owner.body);
    if (!untouched) return false;
    const index = owner.parameters.indexOf(parameter);
    let calls = 0;
    let safe = true;
    const matchesModule = (specifier, from) => {
      if (!specifier.startsWith('.')) return false;
      const base = resolve(dirname(from), specifier);
      return [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.mjs`, join(base, 'index.ts')].includes(filename);
    };
    for (const path of sourceFiles(functionsRoot).filter(path => /\.[cm]?[jt]sx?$/.test(path) && !/\.(?:test|spec)\./.test(path))) {
      const file = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
      const scope = queryLineage(file);
      const names = new Set(path === filename ? [owner.name.text] : []);
      for (const statement of file.statements) {
        if (ts.isExportDeclaration(statement) && statement.moduleSpecifier && ts.isStringLiteralLike(statement.moduleSpecifier) &&
          matchesModule(statement.moduleSpecifier.text, path)) return false;
        if (!ts.isImportDeclaration(statement) || !ts.isStringLiteralLike(statement.moduleSpecifier) ||
          !matchesModule(statement.moduleSpecifier.text, path) || statement.importClause?.isTypeOnly) continue;
        const imports = statement.importClause?.namedBindings;
        if (statement.importClause?.name || !imports || !ts.isNamedImports(imports)) return false;
        for (const item of imports.elements) if (!item.isTypeOnly && (item.propertyName ?? item.name).text === owner.name.text) names.add(item.name.text);
      }
      const inspect = node => {
        if (ts.isImportDeclaration(node)) return;
        if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) safe = false;
        if (ts.isIdentifier(node) && names.has(node.text)) {
          const parent = node.parent;
          const binding = scope.resolveBinding(node, true);
          const ownDeclaration = path === filename && binding && ts.isFunctionDeclaration(binding) && binding.name?.text === owner.name.text;
          if ((!binding || ownDeclaration) && !(ts.isFunctionDeclaration(parent) && parent.name === node) &&
            !(ts.isPropertyAccessExpression(parent) && parent.name === node)) {
            if (!ts.isCallExpression(parent) || parent.expression !== node || parent.arguments.length > index || parent.arguments.some(ts.isSpreadElement)) safe = false;
            else calls++;
          }
        }
        ts.forEachChild(node, inspect);
      };
      inspect(file);
    }
    return safe && calls > 0;
  };
  const loadModule = specifier => {
    const base = resolve(dirname(sourceFile.fileName), specifier);
    for (const path of [base, `${base}.ts`, `${base}.tsx`, `${base}.mjs`, `${base}.js`, join(base, 'index.ts')]) {
      if (audit.modules.has(path)) return audit.modules.get(path);
      let source;
      try { source = readFileSync(path, 'utf8'); } catch { continue; }
      const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
      const module = { file, lineage: queryLineage(file) };
      audit.modules.set(path, module);
      return module;
    }
    return failEnvCall();
  };
  const callable = (node, seen = new Set()) => {
    if (isErasedExpressionWrapper(node)) return callable(node.expression, seen);
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken &&
      ts.isPropertyAccessExpression(node.left) && ts.isIdentifier(node.left.expression)) {
      const parameter = lineage.resolveBinding(node.left.expression, true);
      if (parameter && ts.isParameter(parameter) && provesEmptyDefault(parameter)) return callable(node.right, seen);
      return failEnvCall();
    }
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return { file: sourceFile, lineage, fn: node };
    if (!ts.isIdentifier(node)) return failEnvCall();
    const binding = lineage.resolveBinding(node, true);
    if (binding) {
      if (seen.has(binding)) return failEnvCall();
      if (ts.isFunctionDeclaration(binding) && binding.body) return { file: sourceFile, lineage, fn: binding };
      if (!ts.isVariableDeclaration(binding) || !binding.initializer || !ts.isVariableDeclarationList(binding.parent) ||
        !(binding.parent.flags & ts.NodeFlags.Const)) return failEnvCall();
      return callable(binding.initializer, new Set([...seen, binding]));
    }
    const imported = localImports.get(node.text);
    if (!imported) return failEnvCall();
    const module = loadModule(imported.module);
    for (const statement of module.file.statements) {
      if (!statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) continue;
      if (ts.isFunctionDeclaration(statement) && statement.name?.text === imported.name && statement.body) return { ...module, fn: statement };
      if (ts.isVariableStatement(statement) && (statement.declarationList.flags & ts.NodeFlags.Const)) for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.name.text === imported.name && declaration.initializer &&
          (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer))) return { ...module, fn: declaration.initializer };
      }
    }
    return failEnvCall();
  };
  const proveEnvCall = (call, argument, property = null) => {
    if (call.arguments.some(ts.isSpreadElement)) return failEnvCall();
    const target = callable(call.expression);
    const targetBinding = ts.isFunctionDeclaration(target.fn) ? target.fn : target.fn.parent;
    if (!stableCallable(target.file, target.lineage, targetBinding)) return failEnvCall();
    const parameter = target.fn.parameters[call.arguments.indexOf(argument)];
    if (!parameter || parameter.dotDotDotToken || parameter.initializer) return failEnvCall();
    let binding = parameter;
    if (property !== null && ts.isObjectBindingPattern(parameter.name)) {
      binding = parameter.name.elements.find(element => {
        const key = element.propertyName ?? element.name;
        return !element.dotDotDotToken && !element.initializer && ts.isIdentifier(element.name) &&
          (ts.isIdentifier(key) || ts.isStringLiteralLike(key)) && key.text === property;
      });
    }
    if (!binding || !ts.isIdentifier(binding.name)) return failEnvCall();
    target.lineage.markEnvironmentBinding(binding);
    if (!resolve(target.file.fileName).startsWith(`${resolve('functions')}/`)) {
      const requireInstrumentedDatabase = node => {
        if (ts.isTypeNode(node)) return;
        if (target.lineage.isDatabaseExpression(node) || isQueryRoot(node, target.lineage)) return failEnvCall();
        ts.forEachChild(node, requireInstrumentedDatabase);
      };
      requireInstrumentedDatabase(target.fn.body);
    }
    const key = `${target.file.fileName}:${target.fn.pos}:${binding.pos}`;
    if (audit.active.has(key) || audit.verified.has(key)) return true;
    audit.active.add(key);
    try {
      assertSupportedDatabaseCalls(target.file, target.lineage, new Map(), audit, target.fn.body);
      audit.verified.add(key);
    } finally { audit.active.delete(key); }
    return true;
  };
  const trackedCallArgument = (call, argument) => {
    if (!ts.isCallExpression(call) || !ts.isIdentifier(call.expression)) return false;
    const target = lineage.resolveBinding(call.expression);
    if (!target) return packageAdapters.has(call.expression.text);
    if (!ts.isFunctionDeclaration(target)) return false;
    const parameter = target.parameters[call.arguments.indexOf(argument)];
    return parameter && !parameter.dotDotDotToken && ts.isIdentifier(parameter.name) && lineage.isDatabaseExpression(parameter.name);
  };
  // An inline options object may deliver a handle to an independently tracked
  // destructured parameter of a local named function. Stored/returned objects,
  // arbitrary callbacks and external containers have no proven handle lineage.
  const trackedObjectParameter = property => {
    const object = property.parent;
    const call = object.parent;
    if (!ts.isObjectLiteralExpression(object) || !ts.isCallExpression(call) || !ts.isIdentifier(call.expression)) return false;
    const target = lineage.resolveBinding(call.expression);
    if (!target || !ts.isFunctionDeclaration(target)) return false;
    const parameter = target.parameters[call.arguments.indexOf(object)];
    if (!parameter || !ts.isObjectBindingPattern(parameter.name)) return false;
    const name = property.name && (ts.isIdentifier(property.name) || ts.isStringLiteralLike(property.name)) ? property.name.text : null;
    return name !== null && parameter.name.elements.some(element => {
      const key = element.propertyName ?? element.name;
      return !element.dotDotDotToken && (ts.isIdentifier(key) || ts.isStringLiteralLike(key)) && key.text === name &&
        ts.isIdentifier(element.name) && lineage.isDatabaseExpression(element.name);
    });
  };
  const isBuilder = (node) => {
    if (ts.isIdentifier(node)) return Boolean(lineage.builderDefinition(node));
    if (isErasedExpressionWrapper(node)) return isBuilder(node.expression);
    if (isAccess(node)) return isBuilder(node.expression);
    if (ts.isConditionalExpression(node)) return isBuilder(node.whenTrue) || isBuilder(node.whenFalse);
    if (ts.isCallExpression(node)) return isQueryRoot(node, lineage) ||
      (ts.isIdentifier(node.expression) && (adapterNames.has(node.expression.text) || isBuilder(node.expression))) ||
      (isAccess(node.expression) && isBuilder(node.expression.expression));
    return false;
  };
  const assertHandleUse = node => {
    if (!lineage.isDatabaseExpression(node)) return;
    const parent = node.parent;
    // Declaration/property names are syntax, not evaluated handle values.
    if ((ts.isVariableDeclaration(parent) || ts.isParameter(parent) || ts.isBindingElement(parent) || ts.isFunctionDeclaration(parent)) && parent.name === node) return;
    if ((ts.isPropertyAccessExpression(parent) || ts.isPropertyAssignment(parent) || ts.isMethodDeclaration(parent) || ts.isPropertyDeclaration(parent)) && parent.name === node) return;
    // Audit the outer wrapper/receiver, never mistake a type assertion for an
    // execution boundary. Every other evaluated use needs positive lineage.
    if ((isErasedExpressionWrapper(parent) || ts.isAwaitExpression(parent)) && parent.expression === node) return;
    if (isAccess(parent) && parent.expression === node) return;
    if (ts.isCallExpression(parent) && parent.expression === node && isAccess(node)) return;
    if (ts.isVariableDeclaration(parent) && parent.initializer === node && ts.isIdentifier(parent.name)) return;
    if (ts.isCallExpression(parent) && parent.arguments.includes(node) && trackedCallArgument(parent, node)) return;
    if (((ts.isPropertyAssignment(parent) && parent.initializer === node) || ts.isShorthandPropertyAssignment(parent)) && trackedObjectParameter(parent)) return;
    if (ts.isArrowFunction(parent) && parent.body === node &&
      ts.isVariableDeclaration(parent.parent) && ts.isIdentifier(parent.parent.name) && parent.parent.name.text === 'createDb' &&
      ts.isCallExpression(node) && ts.isIdentifier(node.expression) && packageAdapters.has(node.expression.text) &&
      !lineage.resolveBinding(node.expression)) return;
    // In particular aggregates, yield, tagged templates, class fields, returns,
    // assignments and unrecognized future syntax cannot discard the origin.
    failHandle(node);
  };
  const visit = (node) => {
    // Reject an Env value at transfer, before an arbitrary container property
    // or array index can erase its binding lineage. Direct lexical aliases and
    // binding reads stay intact and are audited at their eventual use.
    if (lineage.hasEnvironmentOrigin(node)) {
      const parent = node.parent;
      const storedProperty = (ts.isPropertyAssignment(parent) && parent.initializer === node) || ts.isShorthandPropertyAssignment(parent);
      const inlineEnvArgument = storedProperty && (parent.name?.text === 'env') &&
        ts.isObjectLiteralExpression(parent.parent) && ts.isCallExpression(parent.parent.parent) &&
        proveEnvCall(parent.parent.parent, parent.parent, 'env');
      const directArrayBinding = ts.isArrayLiteralExpression(parent) && ts.isVariableDeclaration(parent.parent) &&
        parent.parent.initializer === parent && ts.isArrayBindingPattern(parent.parent.name) &&
        !parent.parent.name.elements.some(element => ts.isBindingElement(element) && element.dotDotDotToken);
      const syntaxName = ((ts.isVariableDeclaration(parent) || ts.isParameter(parent) || ts.isBindingElement(parent) ||
        ts.isFunctionDeclaration(parent)) && (parent.name === node || parent.propertyName === node)) ||
        ((ts.isPropertyAccessExpression(parent) || ts.isPropertyAssignment(parent)) && parent.name === node);
      const directAlias = (ts.isVariableDeclaration(parent) || ts.isBindingElement(parent)) && parent.initializer === node;
      const receiver = isAccess(parent) && parent.expression === node;
      const wrapper = isErasedExpressionWrapper(parent) && parent.expression === node;
      const trackedArgument = ts.isCallExpression(parent) && parent.arguments.includes(node) && proveEnvCall(parent, node);
      if (!syntaxName && !directAlias && !receiver && !wrapper && !inlineEnvArgument && !directArrayBinding && !trackedArgument) {
        throw new Error(`Unsupported database environment transfer at ${sourceFile.fileName}; keep a direct Env alias and access its binding directly.`);
      }
    }
    if ((node.flags & ts.NodeFlags.OptionalChain) &&
      (lineage.isDatabaseExpression(node) || (ts.isCallExpression(node) && isAccess(node.expression) &&
        (lineage.isDatabaseExpression(node.expression.expression) || isBuilder(node.expression.expression))))) {
      throw new Error(`Unsupported database optional access at ${sourceFile.fileName}; use an explicit branch and direct query.`);
    }
    if (ts.isElementAccessExpression(node) && lineage.bindingAccessName(node) === null &&
      (lineage.isEnvironmentExpression(node.expression) ||
        (isAccess(node.parent) && node.parent.expression === node &&
          ['prepare', 'exec', 'execute', 'batch', 'select', 'insert', 'update'].includes(accessName(node.parent))))) {
      throw new Error(`Unsupported database computed binding at ${sourceFile.fileName}; use a provable static binding name.`);
    }
    if (ts.isBindingElement(node) && node.propertyName && ts.isComputedPropertyName(node.propertyName) &&
      (lineage.staticBindingName(node.propertyName.expression) === 'DB' ||
        (lineage.staticBindingName(node.propertyName.expression) === null &&
          lineage.isEnvironmentExpression(node.parent.parent.initializer ?? node.name)))) {
      throw new Error(`Unsupported database computed binding destructuring at ${sourceFile.fileName}; alias the binding directly.`);
    }
    // Instantiation expressions are classified as TypeNodes by TypeScript but
    // still evaluate their expression (e.g. handle<T>); audit that operand.
    if ((ts.isTypeNode(node) && !ts.isExpressionWithTypeArguments(node)) || ts.isImportDeclaration(node)) return;
    assertHandleUse(node);
    if (ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) {
      let databaseAssignment = false;
      const inspect = (child) => {
        if (ts.isAwaitExpression(child) || ts.isFunctionLike(child)) return;
        if (isBuilder(child) || lineage.isDatabaseExpression(child)) databaseAssignment = true;
        ts.forEachChild(child, inspect);
      };
      inspect(node.left);
      inspect(node.right);
      if (databaseAssignment) throw new Error(`Unsupported database execution assignment at ${sourceFile.fileName}:${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1}; use a declaration initializer and directly consume each query branch.`);
    }
    if (isQueryRoot(node, lineage) || (ts.isIdentifier(node) && lineage.builderDefinition(node) &&
      !(ts.isVariableDeclaration(node.parent) && node.parent.name === node))) {
      assertSupportedBuilderExecution(node, outerQueryChain(node, sourceFile), sourceFile, sourceFile);
    }
    if (ts.isCallExpression(node) && isAccess(node.expression)) {
      const receiver = node.expression.expression;
      const database = lineage.isDatabaseExpression(receiver);
      const builder = isBuilder(receiver);
      const method = propertyCallName(node);
      if ((database || builder) && (!method || ['then', 'catch', 'finally'].includes(method) ||
        (database && method !== 'prepare' && !QUERY_METHODS.has(method)) ||
        (builder && !BUILDER_METHODS.has(method) && !EAGER_METHODS.has(method)))) {
        throw new Error(`Unsupported database execution ${node.expression.getText(sourceFile)} at ${sourceFile.fileName}:${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1}; use a statically named, directly awaited query.`);
      }
    }
    // Detached/dynamic method values lose their receiver and execution lineage.
    // Reject at extraction, before an alias or destructuring can hide the call.
    if (isAccess(node) && (lineage.isDatabaseExpression(node.expression) || isBuilder(node.expression)) &&
      !(ts.isCallExpression(node.parent) && node.parent.expression === node) &&
      (!accessName(node) || QUERY_METHODS.has(accessName(node)) || EAGER_METHODS.has(accessName(node)) ||
        ['prepare', 'then', 'catch', 'finally'].includes(accessName(node)))) {
      throw new Error(`Unsupported database execution method extraction at ${sourceFile.fileName}:${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1}; call the statically named method directly.`);
    }
    if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name) && node.initializer &&
      (lineage.isDatabaseExpression(node.initializer) || isBuilder(node.initializer))) {
      throw new Error(`Unsupported database execution destructuring at ${sourceFile.fileName}:${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1}; alias the database or builder itself.`);
    }
    ts.forEachChild(node, visit);
  };
  visit(boundary);
}

function lazyQueryAdapterNames(sourceFile, lineage, adapterNames = new Map()) {
  const names = new Map();
  const visit = (node) => {
    if (ts.isFunctionDeclaration(node) && node.name && !node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword)) {
      let returnsLazyQuery = false;
      const inspect = (child) => {
        if (child !== node && ts.isFunctionLike(child)) return;
        if (ts.isReturnStatement(child) && child.expression) {
          returnsLazyQuery ||= queryExpressions(child.expression, { lineage, sourceFile, adapterNames }).some((entry) => propertyCallName(entry.node) !== 'batch');
        }
        ts.forEachChild(child, inspect);
      };
      inspect(node);
      if (returnsLazyQuery) {
        if (names.has(node.name.text)) throw new Error(`Unsupported database execution: ambiguous lazy adapter ${node.name.text} in ${sourceFile.fileName}`);
        names.set(node.name.text, node);
      }
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
  let lineage = queryLineage(sourceFile);
  let adapterNames = new Map();
  for (;;) {
    const next = lazyQueryAdapterNames(sourceFile, lineage, adapterNames);
    if (next.size === adapterNames.size) break;
    adapterNames = next;
    lineage = queryLineage(sourceFile, adapterNames);
  }
  assertSupportedDatabaseCalls(sourceFile, lineage, adapterNames);
  const candidates = [];
  const visit = (node) => {
    if (ts.isIfStatement(node) && isEndpointCondition(node.expression)) {
      candidates.push({ kind: 'endpoint', node, instrumentNode: node, semantic: semanticTokens(node.expression, sourceFile), owner: functionName(node) });
    }
    if (ts.isAwaitExpression(node)) {
      for (const expression of queryExpressions(node.expression, { lineage, skipNestedAwait: true, adapterNames, sourceFile })) {
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
    // Eager database APIs execute even without await/return. Find their complete
    // source chain, but retain a single unit when an enclosing await also finds it.
    if (ts.isCallExpression(node) && EAGER_METHODS.has(propertyCallName(node)) &&
      (propertyCallName(node) !== 'values' || lineage.isDatabaseExpression(node.expression.expression))) {
      for (const expression of queryExpressions(node, { lineage, skipNestedAwait: true, adapterNames, sourceFile })) {
        if (expression.node === node) candidates.push({ kind: 'query', node, instrumentNode: node, semantic: expression.semantic, owner: functionName(node) });
      }
    }
    if (isPromiseConsumer(node)) {
      for (const expression of queryExpressions(node, { lineage, skipNestedAwait: true, adapterNames, sourceFile })) {
        candidates.push({ kind: 'query', node: expression.node, instrumentNode: expression.node, semantic: expression.semantic, owner: functionName(node) });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  // Every construction must be attributable to a real consumer. Expand only
  // lexical initializer and named-adapter edges; do not infer mutable data flow.
  // Batch statement selection is handled separately from dependency accounting.
  const accounted = new Set();
  const dependencies = (start) => {
    const seen = new Set();
    const origins = new Set();
    const semantics = [];
    const walk = (node) => {
      if (seen.has(node)) return;
      seen.add(node);
      if (isQueryRoot(node, lineage) || (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && adapterNames.has(node.expression.text))) origins.add(node);
      if (ts.isIdentifier(node)) {
        const definition = lineage.builderDefinition(node);
        if (definition && !seen.has(definition)) {
          semantics.push(semanticTokens(definition, sourceFile));
          walk(definition);
        }
        const adapter = adapterNames.get(node.text);
        if (adapter && !seen.has(adapter)) {
          semantics.push(semanticTokens(adapter, sourceFile));
          walk(adapter);
        }
      }
      ts.forEachChild(node, walk);
    };
    walk(start);
    return { origins, semantics };
  };
  const failOrigin = (node, reason) => {
    throw new Error(`Unsupported database origin at ${path}:${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1}; ${reason}`);
  };
  // Follow values delivered to batch, rather than crediting every construction
  // mentioned in its transitive syntax. Tag only final lazy statement values.
  const batchStatements = (input, seen = new Set()) => {
    if (seen.has(input)) failOrigin(input, 'cyclic batch input.');
    const next = new Set([...seen, input]);
    if (isErasedExpressionWrapper(input)) return batchStatements(input.expression, next);
    if (ts.isIdentifier(input)) {
      const definition = lineage.builderDefinition(input);
      if (!definition) failOrigin(input, 'batch input requires a statically tracked statement initializer.');
      return batchStatements(definition, next);
    }
    if (ts.isArrayLiteralExpression(input)) return input.elements.flatMap(element => batchStatements(ts.isSpreadElement(element) ? element.expression : element, next));
    if (ts.isConditionalExpression(input)) return [...batchStatements(input.whenTrue, next), ...batchStatements(input.whenFalse, next)];
    if (propertyCallName(input) === 'map') {
      const callback = input.arguments[0];
      if (!callback || !ts.isArrowFunction(callback) || ts.isBlock(callback.body)) failOrigin(input, 'batch maps require an expression arrow returning tracked statements.');
      return batchStatements(callback.body, next);
    }
    if (ts.isCallExpression(input)) {
      const { origins } = dependencies(input);
      if ([...origins].filter(origin => isQueryRoot(origin, lineage)).length === 1 && [...origins].every(origin => propertyCallName(origin) !== 'batch') &&
        (!EAGER_METHODS.has(propertyCallName(input)) || propertyCallName(input) === 'values')) return [input];
    }
    failOrigin(input, 'unsupported batch statement value; use direct lazy statements, immutable aliases, conditional arrays or maps.');
  };
  for (const candidate of [...candidates]) {
    if (candidate.kind !== 'query' || propertyCallName(candidate.node) !== 'batch') continue;
    if (candidate.node.arguments.length !== 1) failOrigin(candidate.node, 'batch requires one tracked statement array.');
    candidate.mode = 'batch';
    for (const statement of batchStatements(candidate.node.arguments[0])) {
      candidates.push({ kind: 'query', mode: 'statement', node: statement, instrumentNode: statement,
        semantic: `batch-statement:${semanticTokens(statement, sourceFile)}`, owner: functionName(statement) });
    }
  }
  for (const adapter of adapterNames.values()) {
    const returns = [];
    const inspect = (node) => {
      if (node !== adapter && ts.isFunctionLike(node)) return;
      if (ts.isReturnStatement(node)) returns.push(node);
      ts.forEachChild(node, inspect);
    };
    inspect(adapter);
    let returned = returns[0]?.expression;
    while (returned && (ts.isParenthesizedExpression(returned) || ts.isAsExpression(returned) || ts.isNonNullExpression(returned))) returned = returned.expression;
    if (returns.length !== 1 || returns[0].parent !== adapter.body || [...dependencies(adapter).origins].filter((node) => isQueryRoot(node, lineage)).length !== 1 ||
      (returned && (ts.isConditionalExpression(returned) || ts.isBinaryExpression(returned)))) {
      failOrigin(adapter, 'lazy adapters must have one unconditional return and one transitive query origin; directly consume alternative branches.');
    }
  }
  for (const candidate of candidates.filter((entry) => entry.kind === 'query')) {
    const { origins, semantics } = dependencies(candidate.node);
    for (const origin of origins) accounted.add(origin);
    candidate.semantic += semantics.length ? `=>${semantics.join('=>')}` : '';
  }
  const auditOrigins = (node) => {
    if ((isQueryRoot(node, lineage) || (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && adapterNames.has(node.expression.text))) && !accounted.has(node)) {
      failOrigin(node, 'query construction has no proven execution consumer; await it directly or use a consumed named lazy adapter or batch statement array.');
    }
    ts.forEachChild(node, auditOrigins);
  };
  auditOrigins(sourceFile);

  const duplicates = new Map();
  return [...new Map(candidates.map((candidate) => [`${candidate.kind}:${candidate.node.getStart(sourceFile)}:${candidate.node.end}`, candidate])).values()]
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
        _mode: candidate.mode,
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
        if (query._mode === 'batch') {
          return factory.updateCallExpression(original,
            factory.createCallExpression(factory.createPropertyAccessExpression(runtimeAccess(factory), 'batchTarget'), undefined,
              [factory.createStringLiteral(query.id), original.expression.expression]), original.typeArguments, original.arguments);
        }
        return factory.createCallExpression(
          factory.createPropertyAccessExpression(runtimeAccess(factory), query._mode === 'statement' ? 'statement' : 'observe'),
          undefined,
          // Evaluate in the original lexical context. Moving an expression into
          // a thunk breaks nested await/yield and can change argument evaluation.
          [factory.createStringLiteral(query.id), original],
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
    return { code, units: units.map(({ _nodeStart, _nodeEnd, _mode, ...unit }) => unit) };
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
    .map(({ _nodeStart, _nodeEnd, _mode, ...unit }) => unit);
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
