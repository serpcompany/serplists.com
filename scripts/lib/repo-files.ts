import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { withoutGitRepositoryOverrides } from "./git-env";

export function walkFiles(root: string, dir: string, predicate: (relativePath: string) => boolean): string[] {
  const absolute = path.join(root, dir);
  if (!existsSync(absolute)) return [];
  return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : walkFiles(root, relative, predicate);
    return predicate(relative) ? [relative] : [];
  });
}

export function directoriesAFreshCheckoutLacks(root: string, dirs: readonly string[]): Set<string> {
  if (dirs.length === 0) return new Set();
  const listed = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", ...dirs], {
    cwd: root,
    env: withoutGitRepositoryOverrides(),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const outsideAGitCheckout = listed.status !== 0;
  if (outsideAGitCheckout) return new Set();
  const filesGitTracksOrWouldTrack = listed.stdout.split("\0").filter(Boolean);
  return new Set(
    dirs.filter((dir) => {
      const prefix = `${dir.replace(/\/+$/, "")}/`;
      return !filesGitTracksOrWouldTrack.some((file) => file.startsWith(prefix));
    }),
  );
}
