import type { Rule } from "eslint";

export const NO_COMMENTS_MESSAGE =
  "Remove the comment. Put what it explains into a clearer name, a smaller function, a test named for the behavior, " +
  "or the doc that owns this area (see AGENTS.md).";

export const noComments: Rule.RuleModule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow every comment, directives included: names, small functions, tests and the docs carry what a comment would say.",
    },
    schema: [],
    messages: { remove: NO_COMMENTS_MESSAGE },
  },
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          const commentType: string = comment.type;
          if (commentType === "Shebang") continue;
          if (!comment.loc) throw new Error("The parser returned a comment without a location, so it cannot be reported.");
          context.report({ loc: comment.loc, messageId: "remove" });
        }
      },
    };
  },
};
