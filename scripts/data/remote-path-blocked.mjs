console.error("BLOCKED: remote staging and production mutations run only through the guarded data-promotion workflows. Use data-command.mjs for a reviewable plan; direct package execution is not authorized.");
process.exit(1);
