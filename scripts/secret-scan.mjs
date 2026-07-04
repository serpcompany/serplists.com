import { spawnSync } from "node:child_process";

const gitResult = spawnSync("git", ["ls-files", "-z"], {
  encoding: "utf8",
});

if (gitResult.error) {
  console.error(gitResult.error.message);
  process.exit(1);
}

if (gitResult.status !== 0) {
  process.stderr.write(gitResult.stderr ?? "");
  process.exit(gitResult.status ?? 1);
}

const files = gitResult.stdout.split("\0").filter(Boolean);

if (files.length === 0) {
  process.exit(0);
}

const secretlintBin = process.platform === "win32" ? "secretlint.cmd" : "secretlint";
const maxCommandLength = process.platform === "win32" ? 7_000 : 100_000;
let chunk = [];
let chunkLength = secretlintBin.length;

function runSecretlint(paths) {
  const result = spawnSync(secretlintBin, paths, {
    shell: process.platform === "win32",
    stdio: "inherit",
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

for (const file of files) {
  const nextLength = chunkLength + file.length + 1;

  if (chunk.length > 0 && nextLength > maxCommandLength) {
    runSecretlint(chunk);
    chunk = [];
    chunkLength = secretlintBin.length;
  }

  chunk.push(file);
  chunkLength += file.length + 1;
}

if (chunk.length > 0) {
  runSecretlint(chunk);
}
