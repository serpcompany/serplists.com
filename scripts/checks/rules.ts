export const commentRule = [
  "Code and config carry no comments (docs/agents/code.md, No comments):",
  "- Say it in the code: name the value, function, type or test for what it means, and move a step that needs explaining into a function named for it.",
  "- Put why it is built this way in the doc AGENTS.md routes to for that area.",
  "- Configure a tool in its config file instead of a directive (eslint-disable, @ts-expect-error), and delete commented-out code: git keeps it.",
  "There are no exceptions. Only the files a tool writes go unchecked, each listed by path in GENERATED_FILES in scripts/check-no-comments-lib.ts.",
].join("\n");

export const docsRule =
  "Docs are the map agents work from (docs/agents/code.md, Docs): every link, heading anchor, repository path, pnpm " +
  "script and named test in them exists, AGENTS.md reaches every doc, each doc sits in the layout under a kebab-case " +
  "name and keeps to its size budget, each skill is described and listed, and nothing hides in an HTML comment. Fix or " +
  "remove what is named, and link a new doc from the doc that routes to its area. Split a doc that outgrows its budget " +
  "by topic. A doc already over budget when the check arrived has an entry in knownLongDocs in " +
  "scripts/checks/doc-rules/budgets.ts at its size, which may only shrink.";

export const sizeRule =
  "Code files stay within 500 lines (docs/agents/code.md, File size). Split a file that outgrows it by responsibility, " +
  "into files named for what each does. An exception needs a reason that makes splitting unsafe now: it goes in " +
  "knownLargeFiles in scripts/checks/sizes.ts with its size and that reason, and may only shrink.";

export const secretRule =
  "A credential in the repository is readable by everyone with access, and git history keeps it after a fix " +
  "(docs/agents/code.md, Secrets). Remove it, have whoever issued it rotate it, and read it from the environment " +
  "instead: a Wrangler secret, a GitHub Actions secret, or the gitignored .dev.vars. A test value that only looks like " +
  "a credential is changed so it does not. There are no exceptions.";

export const duplicateRule =
  "Code says a thing once (docs/agents/code.md, Duplicate code): move what the repeated blocks share into one function, " +
  "type or test helper named for what it does, and call it from each place. Test setup counts too: share a fixture or " +
  "a builder. An exception needs a reason that makes sharing unsafe now: it goes in knownDuplicates in " +
  "scripts/checks/known-duplicates.ts with its number of blocks and that reason, and may only shrink.";

export const deadCodeRule =
  "Nothing unused stays (docs/agents/code.md, Dead code): delete an unused file, export or dependency, stop exporting " +
  "what only its own file uses, and list in package.json a package the code imports. Knip starts from the entry points " +
  "tools load. When it misses a real entry point, a file a tool or runtime loads by name, name it in knip.json, the " +
  "only place an exception goes, with its reason in docs/agents/exceptions.md.";

export const dependencyRule =
  "Imports point one way, as ARCHITECTURE.md draws the layers (docs/agents/code.md, Imports). Each finding above names " +
  "its rule and says where the code belongs: move the code, or import what it needs from a layer it may use. There are " +
  "no exceptions: no baseline, and every rule in .dependency-cruiser.cjs is an error.";

export const linterRule =
  "Workflows lint clean with actionlint, which also runs ShellCheck on their run blocks, at the version pinned in " +
  "scripts/checks/linters.ts (docs/agents/code.md, Linters). Fix what it reports. It runs in Docker, or as an installed " +
  "copy where Docker can't run; with neither it is skipped on this machine, and it fails in CI. There are no exceptions.";

export const generatedRule =
  "Generated files match their source (docs/agents/code.md, Generated files): run the command each finding names and " +
  "commit what it writes, and never edit a generated file by hand. The files a tool writes are listed in " +
  "GENERATED_FILES in scripts/check-no-comments-lib.ts.";

export const stopRule =
  "These are in files changed since the last commit, or in the docs, found before the turn ended " +
  "(docs/agents/code.md, Checks). Fix each one now, or say which you are leaving and why. pnpm run verify runs the " +
  "same checks on the whole repository.";
