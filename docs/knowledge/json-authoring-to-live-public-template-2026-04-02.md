# JSON authoring to live public template (2026-04-02)

## What was proven

We verified that a checklist template can be authored as portable JSON in VS Code, imported into the real `serplists.com` app, and shown under the public `serp` publisher profile.

Confirmed flow:

1. Author template JSON locally in `tmp/local-templates/.../template.json`
2. Keep a generated `README.md` preview next to it for human review
3. Ensure the target account is:
   - password-reset and usable
   - upgraded to `pro`
4. Import the portable JSON pack through the real `POST /api/templates/backup` backend
5. Verify the imported template appears at its public profile route

## Live-tested example

Imported file:

- [template.json](/Users/devin/dev/repos/serplists.com/tmp/local-templates/campsite-breakdown-checklist/template.json)

Verified live result:

- `https://serplists.com/profile/serp/campsite-breakdown-checklist`

## Important behavior notes

- Portable JSON does **not** carry the author username.
- Public author attribution comes from the owning DB user at import time.
- That means the template must be imported while signed in as the intended publisher account if you want the public route to land under `/profile/{username}/...`.

## Current UI limitation

The live import backend works, but the Templates screen can still disable the file picker when:

- `plan === "pro"`
- but `billingEnabled === false`

That is a frontend gating bug, not an import-backend problem.

Workaround used successfully:

- sign in as the target Pro account
- post the portable JSON directly to `POST /api/templates/backup`

## Why this matters

This proves the portable JSON schema is usable as a real authoring format now, before building more GUI around it.

It also gives us the right next backend product direction:

- publisher-oriented import/publish paths
- no dependency on manually using the UI importer for official content
