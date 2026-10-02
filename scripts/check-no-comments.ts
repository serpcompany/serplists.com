import { existsSync, readFileSync, statSync } from "node:fs";

import {
  checkedLanguage,
  filesGitTracksOrWouldTrack,
  findComments,
  type FoundComment,
  NO_COMMENTS_MESSAGE,
} from "./check-no-comments-lib";

function requestedFiles(): string[] {
  if (process.argv.length > 2) return process.argv.slice(2);
  try {
    return filesGitTracksOrWouldTrack();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  }
}

const isFile = (file: string) => existsSync(file) && statSync(file).isFile();
const files = requestedFiles().filter((file) => checkedLanguage(file) && isFile(file));
const countsByLanguage = new Map<string, number>();
const filesWithComments = new Set<string>();
let unreadableFiles = 0;

for (const file of files) {
  let comments: FoundComment[];
  try {
    comments = findComments(file, readFileSync(file, "utf8"));
  } catch (error) {
    unreadableFiles += 1;
    console.log(`${file}  Could not be read to check for comments: ${error instanceof Error ? error.message : String(error)}`);
    continue;
  }
  for (const { line, language } of comments) {
    console.log(`${file}:${line}  ${NO_COMMENTS_MESSAGE} (${language})`);
    countsByLanguage.set(language, (countsByLanguage.get(language) ?? 0) + 1);
    filesWithComments.add(file);
  }
}

const total = [...countsByLanguage.values()].reduce((sum, count) => sum + count, 0);
if (total === 0 && unreadableFiles === 0) {
  console.log(`check-no-comments: no comments in ${files.length} file(s).`);
} else {
  const breakdown = [...countsByLanguage].map(([language, count]) => `${count} ${language}`).join(", ");
  console.log(`check-no-comments: ${total} comment(s) in ${filesWithComments.size} file(s)${breakdown ? ` (${breakdown})` : ""}.`);
  process.exitCode = 1;
}
