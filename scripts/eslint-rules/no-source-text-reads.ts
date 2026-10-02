import path from "node:path";
import type { Rule, Scope, SourceCode } from "eslint";
import type * as ESTree from "estree";

type Bindings = Map<Scope.Variable, string[]>;
type FunctionNode = (ESTree.FunctionDeclaration | ESTree.FunctionExpression | ESTree.ArrowFunctionExpression) &
  Rule.NodeParentExtension;
type Wrapper = { name: string; index: number; variable: Scope.Variable; target: ESTree.Node; folderIsSource: boolean };

const FILE_READERS = new Set(["readFileSync", "readFile", "createReadStream"]);
const FOLDER_READERS = new Set(["readdirSync", "readdir", "opendirSync", "opendir", "globSync", "glob"]);
const PATH_BUILDERS = new Set(["join", "resolve", "normalize"]);
const SOURCE_FOLDERS = new Set(["src", "functions"]);
const SOURCE_ALIASES: ReadonlyArray<readonly [string, string]> = [
  ["@/", "src/"],
  ["@functions/", "functions/"],
  ["/src/", "src/"],
  ["/functions/", "functions/"],
];
const CODE_FILE = /\.(?:[cm]?[jt]sx?|css)$/;
const NAMED_FILE = /\.[^./]+$/;
const UNKNOWN = "\u0000";
const MAX_DEPTH = 8;
const MAX_POSSIBILITIES = 64;

const NO_SOURCE_TEXT_READS_MESSAGE =
  "Tests check what code does, not how it is written: reading {{path}} as text breaks on a harmless refactor and " +
  "passes when the behavior breaks. Import the module and call it, render the component or send the request, and " +
  "assert the outcome. A rule about how all code is written (always import X from Y, never call Z) belongs in an " +
  "ESLint rule (scripts/eslint-rules/, scripts/eslint-rules/code-conventions.ts) or a dependency-cruiser rule. " +
  "Import data the app ships (JSON) instead of reading its file.";

const calleeName = (callee: ESTree.Node): string | null => {
  if (callee.type === "Identifier") return callee.name;
  if (callee.type === "MemberExpression" && !callee.computed && callee.property.type === "Identifier") {
    return callee.property.name;
  }
  return null;
};

const isImportMetaGlob = (callee: ESTree.Node) =>
  callee.type === "MemberExpression" &&
  callee.object.type === "MetaProperty" &&
  callee.object.meta.name === "import" &&
  callee.property.type === "Identifier" &&
  callee.property.name === "glob";

function findVariable(scope: Scope.Scope | null, name: string): Scope.Variable | null {
  for (let current = scope; current; current = current.upper) {
    const variable = current.set.get(name);
    if (variable) return variable;
  }
  return null;
}

function constInitializer(variable: Scope.Variable | null): ESTree.Expression | null {
  const definition = variable?.defs[0];
  if (definition?.type !== "Variable" || definition.parent.kind !== "const") return null;
  return definition.node.id.type === "Identifier" ? (definition.node.init ?? null) : null;
}

function loopSource(sourceCode: SourceCode, variable: Scope.Variable | null): ESTree.Expression | null {
  const definition = variable?.defs[0];
  if (definition?.type !== "Variable") return null;
  const loop = sourceCode.getAncestors(definition.parent).at(-1);
  return loop?.type === "ForOfStatement" && loop.left === definition.parent ? loop.right : null;
}

const pathFunction = (node: ESTree.Node | null): ESTree.ArrowFunctionExpression | null =>
  node?.type === "ArrowFunctionExpression" &&
  node.body.type !== "BlockStatement" &&
  node.params.every((param) => param.type === "Identifier")
    ? node
    : null;

const combine = (parts: readonly string[][]) =>
  parts.reduce<string[]>(
    (texts, options) => texts.flatMap((text) => options.map((option) => text + option)).slice(0, MAX_POSSIBILITIES),
    [""],
  );

const joined = (parts: readonly string[][]) => combine(parts.flatMap((options, index) => (index === 0 ? [options] : [["/"], options])));

const literalValue = (node: ESTree.Node) => (node.type === "Literal" ? node.value : undefined);

function createEvaluator(sourceCode: SourceCode) {
  const variableOf = (identifier: ESTree.Identifier) => findVariable(sourceCode.getScope(identifier), identifier.name);

  const textsOf = (node: ESTree.Node | null | undefined, bindings: Bindings, depth: number): string[] => {
    if (!node || depth > MAX_DEPTH) return [UNKNOWN];
    const next = (child: ESTree.Node | null | undefined, childBindings: Bindings = bindings) => textsOf(child, childBindings, depth + 1);
    switch (node.type) {
      case "Literal":
        return [typeof node.value === "string" ? node.value : UNKNOWN];
      case "TemplateLiteral":
        return combine(
          node.quasis.flatMap((quasi, index) => [
            [quasi.value.cooked ?? UNKNOWN],
            ...(index < node.expressions.length ? [next(node.expressions[index])] : []),
          ]),
        );
      case "BinaryExpression":
        return node.operator === "+" ? combine([next(node.left), next(node.right)]) : [UNKNOWN];
      case "ArrayExpression":
        return node.elements.flatMap((element) => (element && element.type !== "SpreadElement" ? next(element) : [UNKNOWN]));
      case "Identifier": {
        const variable = variableOf(node);
        const bound = variable ? bindings.get(variable) : undefined;
        if (bound) return bound;
        const loop = loopSource(sourceCode, variable);
        if (loop) return next(loop);
        const initializer = constInitializer(variable);
        return initializer && !pathFunction(initializer) ? next(initializer) : [UNKNOWN];
      }
      case "CallExpression": {
        const name = calleeName(node.callee);
        if (name !== null && PATH_BUILDERS.has(name)) return joined(node.arguments.map((argument) => next(argument)));
        if (name === "fileURLToPath") return next(node.arguments[0]);
        const local = pathFunction(node.callee.type === "Identifier" ? constInitializer(variableOf(node.callee)) : null);
        if (!local) return [UNKNOWN];
        const scope = sourceCode.getScope(local.body);
        const inner: Bindings = new Map(bindings);
        local.params.forEach((param, index) => {
          const variable = param.type === "Identifier" ? findVariable(scope, param.name) : null;
          if (variable) inner.set(variable, next(node.arguments[index]));
        });
        return next(local.body, inner);
      }
      case "NewExpression":
        return node.callee.type === "Identifier" && node.callee.name === "URL" ? next(node.arguments[0]) : [UNKNOWN];
      default:
        return [UNKNOWN];
    }
  };
  return (node: ESTree.Node | null | undefined, bindings: Bindings = new Map()) => textsOf(node, bindings, 0);
}

const firstSourcePath = (texts: readonly string[], options: { folderIsSource: boolean }) =>
  texts.map((text) => sourcePathNamedBy(text, options)).find(Boolean) ?? null;

function sourcePathNamedBy(text: string, { folderIsSource }: { folderIsSource: boolean }): string | null {
  const segments = text.replace(/\\/g, "/").split("/");
  let start = 0;
  while (start < segments.length && ["", ".", ".."].includes((segments[start] ?? "").replaceAll(UNKNOWN, ""))) start += 1;
  if (start >= segments.length || !SOURCE_FOLDERS.has(segments[start] ?? "")) return null;
  const named = segments.slice(start).join("/").replaceAll(UNKNOWN, "*");
  const last = segments.at(-1) ?? "";
  const knownEnd = last.slice(last.lastIndexOf(UNKNOWN) + 1);
  if (last.includes(UNKNOWN) && !NAMED_FILE.test(knownEnd)) return named;
  if (!NAMED_FILE.test(knownEnd)) return folderIsSource ? named : null;
  return CODE_FILE.test(knownEnd) ? named : null;
}

function sourcePathOfModule(specifier: string, filename: string, cwd: string): string | null {
  if (!specifier.includes("?raw")) return null;
  const withoutQuery = specifier.slice(0, specifier.indexOf("?"));
  const alias = SOURCE_ALIASES.find(([prefix]) => withoutQuery.startsWith(prefix));
  if (alias) return sourcePathNamedBy(`${alias[1]}${withoutQuery.slice(alias[0].length)}`, { folderIsSource: true });
  if (!withoutQuery.startsWith(".")) return null;
  const relative = path.relative(cwd, path.resolve(path.dirname(filename), withoutQuery)).split(path.sep).join("/");
  return relative.startsWith("..") ? null : sourcePathNamedBy(relative, { folderIsSource: true });
}

const globIsRaw = (options: ESTree.Node | undefined) =>
  options?.type === "ObjectExpression" &&
  options.properties.some(
    (property) =>
      property.type === "Property" &&
      property.key.type === "Identifier" &&
      ((property.key.name === "query" && literalValue(property.value) === "?raw") ||
        (property.key.name === "as" && literalValue(property.value) === "raw")),
  );

function enclosingFunction(node: Rule.Node): FunctionNode | null {
  for (let current: Rule.Node | null = node.parent; current; current = current.parent) {
    if (current.type === "FunctionDeclaration" || current.type === "FunctionExpression" || current.type === "ArrowFunctionExpression") {
      return current;
    }
  }
  return null;
}

function nameOfFunction(fn: FunctionNode): string | null {
  if (fn.type === "FunctionDeclaration") return fn.id?.name ?? null;
  const declarator = fn.parent;
  return declarator.type === "VariableDeclarator" && declarator.id.type === "Identifier" ? declarator.id.name : null;
}

export const noSourceTextReads: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow tests that read an authored code file under src/ or functions/ as text, list those folders to read " +
        "their files, or import one with ?raw.",
    },
    schema: [],
    messages: { behaviorNotText: NO_SOURCE_TEXT_READS_MESSAGE },
  },
  create(context) {
    const { sourceCode } = context;
    const evaluate = createEvaluator(sourceCode);
    const wrappers: Wrapper[] = [];
    const calls: ESTree.CallExpression[] = [];

    const report = (node: ESTree.Node, named: string) => context.report({ node, messageId: "behaviorNotText", data: { path: named } });

    const checkRead = (call: ESTree.CallExpression & Rule.NodeParentExtension, folderIsSource: boolean) => {
      const target = call.arguments[0];
      if (!target) return;
      const named = firstSourcePath(evaluate(target), { folderIsSource });
      if (named) {
        report(call, named);
        return;
      }
      const fn = enclosingFunction(call);
      const name = fn && nameOfFunction(fn);
      if (!fn || !name) return;
      fn.params.forEach((param, index) => {
        if (param.type !== "Identifier") return;
        const variable = findVariable(sourceCode.getScope(fn.body), param.name);
        if (variable) wrappers.push({ name, index, variable, target, folderIsSource });
      });
    };

    const checkModule = (node: ESTree.Node, specifier: unknown) => {
      if (typeof specifier !== "string") return;
      const named = sourcePathOfModule(specifier, context.filename, context.cwd);
      if (named) report(node, named);
    };

    return {
      CallExpression(node) {
        calls.push(node);
        if (isImportMetaGlob(node.callee)) {
          if (!globIsRaw(node.arguments[1])) return;
          const [firstArgument] = node.arguments;
          const patterns = firstArgument?.type === "ArrayExpression" ? firstArgument.elements : [firstArgument];
          for (const pattern of patterns) {
            const texts = pattern ? evaluate(pattern) : [UNKNOWN];
            const named = texts
              .map((text) => sourcePathOfModule(`${text.replaceAll(UNKNOWN, "*")}?raw`, context.filename, context.cwd))
              .find(Boolean);
            if (named) report(node, named);
          }
          return;
        }
        const name = calleeName(node.callee);
        if (name !== null && FILE_READERS.has(name)) checkRead(node, false);
        if (name !== null && FOLDER_READERS.has(name)) checkRead(node, true);
      },
      ImportDeclaration(node) {
        checkModule(node, node.source.value);
      },
      ImportExpression(node) {
        if (node.source.type === "Literal") checkModule(node, node.source.value);
      },
      "Program:exit"() {
        for (const wrapper of wrappers) {
          for (const call of calls) {
            if (call.callee.type !== "Identifier" || call.callee.name !== wrapper.name) continue;
            const argument = call.arguments[wrapper.index];
            if (!argument) continue;
            const bound: Bindings = new Map([[wrapper.variable, evaluate(argument)]]);
            const named = firstSourcePath(evaluate(wrapper.target, bound), { folderIsSource: wrapper.folderIsSource });
            if (named) report(call, named);
          }
        }
      },
    };
  },
};
