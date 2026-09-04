console.error("BLOCKED: direct production database access is disabled. Production operations run only through the protected GitHub data-promotion workflow. Use that workflow's guarded identity, ledger, and report steps for read-only evidence; use the documented break-glass incident procedure only when explicitly authorized.");
process.exit(1);
