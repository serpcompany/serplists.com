import path from "node:path";
import type { Rule } from "eslint";
import { z } from "zod";

const conventionsOptionSchema = z
  .array(z.object({ selector: z.string(), message: z.string(), owners: z.array(z.string()).default([]) }))
  .default([]);

export const restrictedCode: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow code a selector matches outside the modules that own it, with a message saying what to use instead. " +
        "Each convention in scripts/eslint-rules/code-conventions.ts is one entry.",
    },
    schema: [
      {
        type: "array",
        items: {
          type: "object",
          properties: {
            selector: { type: "string" },
            message: { type: "string" },
            owners: { type: "array", items: { type: "string" } },
          },
          required: ["selector", "message"],
          additionalProperties: false,
        },
      },
    ],
  },
  create(context) {
    const file = path.relative(context.cwd, context.filename).split(path.sep).join("/");
    const listeners: Record<string, (node: Rule.Node) => void> = {};
    for (const { selector, message, owners } of conventionsOptionSchema.parse(context.options[0])) {
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
