const CASTS = new Set(["TSAsExpression", "TSTypeAssertion"]);
const MESSAGE_OBJECT = /^(?:e|evt|msg)$|event$|message$/i;
const FORM_OBJECT = /form/i;

const PARSE_AT_THE_BOUNDARY = "AGENTS.md: parse external data with a Zod schema at the boundary, since a cast trusts a guessed shape.";

const EXTERNAL_DATA_CAST_MESSAGES = {
  jsonParse:
    "Parse JSON.parse's result with a Zod schema instead of casting it: schema.parse(JSON.parse(text)), or read it as " +
    `unknown first (const value: unknown = JSON.parse(text)) and safeParse it. ${PARSE_AT_THE_BOUNDARY}`,
  responseBody:
    "Parse a response body with a Zod schema instead of casting it. In the app, call the API with " +
    "apiRequest(endpoint, schema) from src/lib/api/request.ts, which turns a body the schema cannot read into the " +
    "usual ApiError; elsewhere, schema.parse(await response.json()). response.json<T>() is a cast too. " +
    PARSE_AT_THE_BOUNDARY,
  storage:
    "Parse a stored value with a Zod schema instead of casting it, as takeKeptRunNoteDrafts() in " +
    "src/features/run-execution/keptNoteDrafts.ts does: what storage holds may have been written by an older version " +
    `of the app. ${PARSE_AT_THE_BOUNDARY}`,
  messageData:
    "Parse the data of a message (postMessage, BroadcastChannel, a worker) with a Zod schema instead of casting it, as " +
    "parseReport() in src/contexts/sessionSync.ts does: another tab or window may run another version of the app. " +
    PARSE_AT_THE_BOUNDARY,
  requestBody:
    "Parse a request body Playwright hands over with a Zod schema instead of casting it: " +
    `schema.parse(request.postDataJSON()). ${PARSE_AT_THE_BOUNDARY}`,
  formData:
    "Read a form field with a check instead of a cast (typeof value === 'string', value instanceof File) or parse the " +
    `fields with a Zod schema. ${PARSE_AT_THE_BOUNDARY}`,
  doubleCast:
    "`as unknown as T` stops the type checker from checking the value. Type it instead: a D1 row with Drizzle's " +
    "typeof table.$inferSelect (or a Pick of it), external data with a Zod schema whose output is the type.",
  neverCast:
    "`as never` stops the type checker from checking the value, as `as unknown as T` does: never is assignable to every " +
    "type. Give the value the type the code receives instead: a complete Env from apiEnv() in tests, a double that " +
    "implements the interface it stands in for, a Zod parse, or a narrowing check.",
};

function unwrapped(node) {
  if (node.type === "AwaitExpression") return unwrapped(node.argument);
  if (node.type === "ChainExpression") return unwrapped(node.expression);
  return node;
}

const memberName = (node) => (node.type === "MemberExpression" && !node.computed && node.property.type === "Identifier" ? node.property.name : null);

const objectName = (node) => (node.type === "MemberExpression" && node.object.type === "Identifier" ? node.object.name : null);

function calledMethod(node) {
  if (node.type !== "CallExpression") return null;
  const callee = node.callee.type === "ChainExpression" ? node.callee.expression : node.callee;
  const method = memberName(callee);
  return method === null ? null : { method, object: objectName(callee) };
}

function externalSourceOf(expression) {
  const value = unwrapped(expression);
  const call = calledMethod(value);
  if (call?.object === "JSON" && call.method === "parse") return "jsonParse";
  if (call?.method === "json") return "responseBody";
  if (call?.method === "getItem") return "storage";
  if (call?.method === "postDataJSON") return "requestBody";
  if (call?.method === "formData") return "formData";
  if ((call?.method === "get" || call?.method === "getAll") && FORM_OBJECT.test(call.object ?? "")) return "formData";
  if (memberName(value) === "data" && MESSAGE_OBJECT.test(objectName(value) ?? "")) return "messageData";
  return null;
}

const castsToUnknown = (node) => node.typeAnnotation.type === "TSUnknownKeyword";
const castsToNever = (node) => node.typeAnnotation.type === "TSNeverKeyword";

export const noExternalDataCasts = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow casting external data (JSON.parse, a response body, a request body, storage, message data, form " +
        "fields), double casts through unknown and casts to never: parse it with a Zod schema at the boundary instead.",
    },
    messages: EXTERNAL_DATA_CAST_MESSAGES,
    schema: [],
  },
  create(context) {
    const checkCast = (node) => {
      if (CASTS.has(node.expression.type) && castsToUnknown(node.expression)) {
        context.report({ node, messageId: "doubleCast" });
        return;
      }
      if (castsToNever(node)) {
        context.report({ node, messageId: "neverCast" });
        return;
      }
      if (castsToUnknown(node)) return;
      const source = externalSourceOf(node.expression);
      if (source) context.report({ node, messageId: source });
    };
    return {
      TSAsExpression: checkCast,
      TSTypeAssertion: checkCast,
      CallExpression(node) {
        if (calledMethod(node)?.method === "json" && node.typeArguments) {
          context.report({ node, messageId: "responseBody" });
        }
      },
    };
  },
};
