import { posix } from "node:path";

export interface Tree {
  files: ReadonlySet<string>;
  folders: ReadonlySet<string>;
  topFolders: ReadonlySet<string>;
}

export function repositoryTree(files: readonly string[]): Tree {
  const folders = new Set<string>(["."]);
  const topFolders = new Set<string>();
  for (const file of files) {
    const first = file.split("/")[0];
    if (first !== undefined && first !== file) topFolders.add(first);
    for (let folder = posix.dirname(file); !folders.has(folder); folder = posix.dirname(folder)) folders.add(folder);
  }
  return { files: new Set(files), folders, topFolders };
}

export const exists = (tree: Tree, path: string) => tree.files.has(path) || tree.folders.has(posix.normalize(path || "."));

const PATH_SHAPE = /^[\w.@[\]()/-]+$/;

export function namedPath(code: string, tree: Tree): string | undefined {
  const candidate = code
    .trim()
    .replace(/^\.\//, "")
    .replace(/:\d+(?:-\d+)?$/, "")
    .replace(/[/:.,;]+$/, "");
  if (!candidate || !PATH_SHAPE.test(candidate)) return undefined;
  const first = candidate.split("/")[0] ?? "";
  const inATrackedFolder = candidate.includes("/") && tree.topFolders.has(first);
  const aTrackedRootFile = !candidate.includes("/") && tree.files.has(candidate);
  return inATrackedFolder || aTrackedRootFile ? candidate : undefined;
}

export function missingPath(doc: string, path: string, tree: Tree): boolean {
  return !exists(tree, path) && !exists(tree, posix.join(posix.dirname(doc), path));
}
