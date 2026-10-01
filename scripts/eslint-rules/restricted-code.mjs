import path from "node:path";

const conventionSchema = {
  type: "object",
  properties: {
    selector: { type: "string" },
    message: { type: "string" },
    owners: { type: "array", items: { type: "string" } },
  },
  required: ["selector", "message"],
  additionalProperties: false,
};

export const restrictedCode = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow code a selector matches outside the modules that own it, with a message saying what to use instead. " +
        "Each convention in scripts/eslint-rules/code-conventions.mjs is one entry.",
    },
    schema: [{ type: "array", items: conventionSchema }],
  },
  create(context) {
    const file = path.relative(context.cwd, context.filename).split(path.sep).join("/");
    const listeners = {};
    for (const { selector, message, owners = [] } of context.options[0] ?? []) {
      if (owners.includes(file)) continue;
      const earlier = listeners[selector];
      listeners[selector] = (node) => {
        earlier?.(node);
        context.report({ node, message });
      };
    }
    return listeners;
  },
};
