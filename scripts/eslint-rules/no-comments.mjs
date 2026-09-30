export const NO_COMMENTS_MESSAGE =
  "Remove the comment. Put what it explains into a clearer name, a smaller function, a test named for the behavior, " +
  "or the doc that owns this area (see AGENTS.md).";

export const noComments = {
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
          if (comment.type !== "Shebang") context.report({ loc: comment.loc, messageId: "remove" });
        }
      },
    };
  },
};
