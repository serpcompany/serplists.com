import path from "node:path";

const FILE_READERS = new Set(["readFileSync", "readFile", "createReadStream"]);
const FOLDER_READERS = new Set(["readdirSync", "readdir", "opendirSync", "opendir", "globSync", "glob"]);
const PATH_BUILDERS = new Set(["join", "resolve", "normalize"]);
const SOURCE_FOLDERS = new Set(["src", "functions"]);
const SOURCE_ALIASES = [
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

export const NO_SOURCE_TEXT_READS_MESSAGE =
  "Tests check what code does, not how it is written: reading {{path}} as text breaks on a harmless refactor and " +
  "passes when the behavior breaks. Import the module and call it, render the component or send the request, and " +
  "assert the outcome. A rule about how all code is written (always import X from Y, never call Z) belongs in an " +
  "ESLint rule (scripts/eslint-rules/, scripts/eslint-rules/code-conventions.mjs) or a dependency-cruiser rule. " +
  "Import data the app ships (JSON) instead of reading its file.";

const calleeName = (callee) => {
  if (callee.type === "Identifier") return callee.name;
  if (callee.type === "MemberExpression" && !callee.computed && callee.property.type === "Identifier") {
    return callee.property.name;
  }
  return null;
};

const isImportMetaGlob = (callee) =>
  callee.type === "MemberExpression" &&
  callee.object.type === "MetaProperty" &&
  callee.object.meta.name === "import" &&
  callee.property.type === "Identifier" &&
  callee.property.name === "glob";

function findVariable(scope, name) {
  for (let current = scope; current; current = current.upper) {
    const variable = current.set.get(name);
    if (variable) return variable;
  }
  return null;
}

function constInitializer(variable) {
  const definition = variable?.defs[0];
  if (definition?.type !== "Variable" || definition.parent.kind !== "const") return null;
  return definition.node.id.type === "Identifier" ? definition.node.init : null;
}

function loopSource(variable) {
  const definition = variable?.defs[0];
  const loop = definition?.type === "Variable" ? definition.parent.parent : null;
  return loop?.type === "ForOfStatement" && loop.left === definition.parent ? loop.right : null;
}

const isPathFunction = (node) =>
  node?.type === "ArrowFunctionExpression" &&
  node.body.type !== "BlockStatement" &&
  node.params.every((param) => param.type === "Identifier");

const combine = (parts) =>
  parts.reduce(
    (texts, options) => texts.flatMap((text) => options.map((option) => text + option)).slice(0, MAX_POSSIBILITIES),
    [""],
  );

const joined = (parts) => combine(parts.flatMap((options, index) => (index === 0 ? [options] : [["/"], options])));

function createEvaluator(sourceCode) {
  const variableOf = (identifier) => findVariable(sourceCode.getScope(identifier), identifier.name);

  const textsOf = (node, bindings, depth) => {
    if (!node || depth > MAX_DEPTH) return [UNKNOWN];
    const next = (child, childBindings = bindings) => textsOf(child, childBindings, depth + 1);
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
        if (variable && bindings.has(variable)) return bindings.get(variable);
        const loop = loopSource(variable);
        if (loop) return next(loop);
        const initializer = constInitializer(variable);
        return initializer && !isPathFunction(initializer) ? next(initializer) : [UNKNOWN];
      }
      case "CallExpression": {
        const name = calleeName(node.callee);
        if (name !== null && PATH_BUILDERS.has(name)) return joined(node.arguments.map((argument) => next(argument)));
        if (name === "fileURLToPath") return next(node.arguments[0]);
        const local = node.callee.type === "Identifier" ? constInitializer(variableOf(node.callee)) : null;
        if (!isPathFunction(local)) return [UNKNOWN];
        const scope = sourceCode.getScope(local.body);
        const inner = new Map(bindings);
        local.params.forEach((param, index) => inner.set(findVariable(scope, param.name), next(node.arguments[index])));
        return next(local.body, inner);
      }
      case "NewExpression":
        return node.callee.type === "Identifier" && node.callee.name === "URL" ? next(node.arguments[0]) : [UNKNOWN];
      default:
        return [UNKNOWN];
    }
  };
  return (node, bindings = new Map()) => textsOf(node, bindings, 0);
}

const firstSourcePath = (texts, options) => texts.map((text) => sourcePathNamedBy(text, options)).find(Boolean) ?? null;

function sourcePathNamedBy(text, { folderIsSource }) {
  const segments = text.replace(/\\/g, "/").split("/");
  let start = 0;
  while (start < segments.length && ["", ".", ".."].includes(segments[start].replaceAll(UNKNOWN, ""))) start += 1;
  if (start >= segments.length || !SOURCE_FOLDERS.has(segments[start])) return null;
  const named = segments.slice(start).join("/").replaceAll(UNKNOWN, "*");
  const last = segments.at(-1) ?? "";
  const knownEnd = last.slice(last.lastIndexOf(UNKNOWN) + 1);
  if (last.includes(UNKNOWN) && !NAMED_FILE.test(knownEnd)) return named;
  if (!NAMED_FILE.test(knownEnd)) return folderIsSource ? named : null;
  return CODE_FILE.test(knownEnd) ? named : null;
}

function sourcePathOfModule(specifier, filename, cwd) {
  if (!specifier.includes("?raw")) return null;
  const withoutQuery = specifier.slice(0, specifier.indexOf("?"));
  const alias = SOURCE_ALIASES.find(([prefix]) => withoutQuery.startsWith(prefix));
  if (alias) return sourcePathNamedBy(`${alias[1]}${withoutQuery.slice(alias[0].length)}`, { folderIsSource: true });
  if (!withoutQuery.startsWith(".")) return null;
  const relative = path.relative(cwd, path.resolve(path.dirname(filename), withoutQuery)).split(path.sep).join("/");
  return relative.startsWith("..") ? null : sourcePathNamedBy(relative, { folderIsSource: true });
}

const globIsRaw = (options) =>
  options?.type === "ObjectExpression" &&
  options.properties.some(
    (property) =>
      property.type === "Property" &&
      property.key.type === "Identifier" &&
      ((property.key.name === "query" && property.value.value === "?raw") ||
        (property.key.name === "as" && property.value.value === "raw")),
  );

function enclosingFunction(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"].includes(current.type)) return current;
  }
  return null;
}

function nameOfFunction(fn) {
  if (fn.type === "FunctionDeclaration") return fn.id?.name ?? null;
  const declarator = fn.parent;
  return declarator?.type === "VariableDeclarator" && declarator.id.type === "Identifier" ? declarator.id.name : null;
}

export const noSourceTextReads = {
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
    const wrappers = [];
    const calls = [];

    const report = (node, named) => context.report({ node, messageId: "behaviorNotText", data: { path: named } });

    const checkRead = (call, folderIsSource) => {
      const target = call.arguments[0];
      if (!target) return;
      const named = firstSourcePath(evaluate(target), { folderIsSource });
      if (named) {
        report(call, named);
        return;
      }
      const fn = enclosingFunction(call);
      const name = fn && nameOfFunction(fn);
      if (!name) return;
      fn.params.forEach((param, index) => {
        if (param.type !== "Identifier") return;
        const variable = findVariable(sourceCode.getScope(fn.body), param.name);
        if (variable) wrappers.push({ name, index, variable, target, folderIsSource });
      });
    };

    const checkModule = (node, specifier) => {
      if (typeof specifier !== "string") return;
      const named = sourcePathOfModule(specifier, context.filename, context.cwd);
      if (named) report(node, named);
    };

    return {
      CallExpression(node) {
        calls.push(node);
        if (isImportMetaGlob(node.callee)) {
          if (!globIsRaw(node.arguments[1])) return;
          const patterns = node.arguments[0]?.type === "ArrayExpression" ? node.arguments[0].elements : [node.arguments[0]];
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
            const bound = new Map([[wrapper.variable, evaluate(argument)]]);
            const named = firstSourcePath(evaluate(wrapper.target, bound), { folderIsSource: wrapper.folderIsSource });
            if (named) report(call, named);
          }
        }
      },
    };
  },
};
