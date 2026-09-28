// File listing helpers shared by the docs check and the maintenance report.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * Lists files under `dir` (relative to `root`, POSIX separators) that match
 * `predicate`, skipping node_modules. A directory that does not exist has no
 * files: git drops a folder once its last tracked file moves out, so optional
 * folders such as docs/exec-plans/active/ can be missing from a fresh checkout.
 */
export function walkFiles(root, dir, predicate) {
  const absolute = path.join(root, dir);
  if (!existsSync(absolute)) return [];
  return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : walkFiles(root, relative, predicate);
    return predicate(relative) ? [relative] : [];
  });
}

/**
 * Returns the directories (as given, relative to `root`) that hold no file git
 * tracks or would track: no committed or staged file and no untracked file that
 * .gitignore allows. A fresh checkout would not have them, even when an empty
 * folder is still on this disk. Returns an empty set outside a git checkout.
 */
export function directoriesWithoutFiles(root, dirs) {
  if (dirs.length === 0) return new Set();
  const listed = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", ...dirs], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (listed.status !== 0) return new Set();
  const files = listed.stdout.split("\0").filter(Boolean);
  return new Set(
    dirs.filter((dir) => {
      const prefix = `${dir.replace(/\/+$/, "")}/`;
      return !files.some((file) => file.startsWith(prefix));
    }),
  );
}
