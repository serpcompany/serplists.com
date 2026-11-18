import { readFileSync } from "node:fs";
import path from "node:path";
import { ESLint, type Linter, SourceCode } from "eslint";
import tseslint from "typescript-eslint";

import { checkedLanguage, findComments } from "../check-no-comments-lib";
import { errorMessage } from "../lib/error-message";
import { noComments } from "../eslint-rules/no-comments";
import { isScriptFile } from "./files";
import { excerpt, onTheirLines, type Problem } from "./problems";

const NO_COMMENTS_RULE = "serplists/no-comments";

const ONLY_THE_NO_COMMENTS_RULE: Linter.Config[] = [
  {
    files: ["**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"],
    languageOptions: { parser: tseslint.parser },
    linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: "off" },
    plugins: { serplists: { rules: { "no-comments": noComments } } },
    rules: { [NO_COMMENTS_RULE]: "error" },
  },
];

async function scriptComments(root: string, scripts: readonly string[]): Promise<Problem[]> {
  if (scripts.length === 0) return [];
  const eslint = new ESLint({ cwd: root, overrideConfigFile: true, overrideConfig: ONLY_THE_NO_COMMENTS_RULE });
  const problems: Problem[] = [];
  for (const file of scripts) {
    const text = readFileSync(path.join(root, file), "utf8");
    const results = await eslint.lintText(text, { filePath: path.join(root, file), warnIgnored: false });
    const messages = results.flatMap((result) => result.messages);
    const comments = messages.filter((message) => message.ruleId === NO_COMMENTS_RULE);
    for (const { line, lineText } of onTheirLines(SourceCode.splitLines(text), comments)) problems.push({ path: file, line, problem: excerpt(lineText) });
    for (const message of messages.filter((each) => each.ruleId !== NO_COMMENTS_RULE && each.fatal)) {
      problems.push({ path: file, line: message.line, problem: `could not be parsed: ${message.message}` });
    }
  }
  return problems;
}

function otherComments(root: string, files: readonly string[]): Problem[] {
  return files.flatMap((file): Problem[] => {
    try {
      const text = readFileSync(path.join(root, file), "utf8");
      return onTheirLines(text.split("\n"), findComments(file, text)).map(({ line, language, lineText }) => ({
        path: file,
        line,
        problem: `${excerpt(lineText)} (${language})`,
      }));
    } catch (error) {
      return [{ path: file, problem: `could not be read to look for comments: ${errorMessage(error)}` }];
    }
  });
}

export async function findCommentProblems(root: string, files: readonly string[]): Promise<Problem[]> {
  return [
    ...(await scriptComments(root, files.filter(isScriptFile))),
    ...otherComments(root, files.filter((file) => checkedLanguage(file) !== null)),
  ];
}
