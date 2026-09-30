import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";

import { checkedLanguage, findComments, NO_COMMENTS_MESSAGE } from "./check-no-comments-lib.mjs";

function listRepositoryFiles() {
  const result = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(2);
  }
  if (result.status !== 0) {
    process.stderr.write(result.stderr ?? "");
    process.exit(result.status ?? 2);
  }
  return result.stdout.split("\0").filter(Boolean);
}

const isFile = (file) => existsSync(file) && statSync(file).isFile();
const requested = process.argv.length > 2 ? process.argv.slice(2) : listRepositoryFiles();
const files = requested.filter((file) => checkedLanguage(file) && isFile(file));
const countsByLanguage = new Map();
const filesWithComments = new Set();
let unreadableFiles = 0;

for (const file of files) {
  let comments;
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
