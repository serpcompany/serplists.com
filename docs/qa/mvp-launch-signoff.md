# Launch Sign-Off Checklist

This is the short sign-off pass for the current `Free + Pro + team workspace` launch scope.

Status note:

- On March 21, 2026, launch was accepted for MVP tracking without a fresh formal rerun of every checklist item below.
- Keep this checklist as the reference if we want to run the full sign-off pass later.

## Free user checks
- Log in as a Free user.
- Open a public template and try `Copy templates into your account`.
- Confirm the user is blocked and sees the intended upgrade CTA.
- Confirm the user can still browse templates and use non-gated product flows.
- Confirm personal template and active-run limits are enforced in the personal workspace.

## Pro user checks
- Log in as a Pro user.
- Open a public template and complete `Copy templates into your account`.
- Confirm the copied template appears in the user account and can be opened/edited.
- Confirm the user can save templates and start runs without backend errors.

## Team workspace checks
- Create a team from `/dashboard/settings`.
- Confirm the creating user is the active `owner` and the workspace switcher selects the team.
- Create a link invite for another account.
- Accept the invite from `/team-invites/:token`.
- Create a second invite and accept it from incoming invites on `/dashboard/settings`.
- Confirm accepted members see the team in the workspace switcher.
- Confirm role permissions:
  - `viewer` can read but cannot edit templates or start runs.
  - `runner` can start/run but cannot edit templates.
  - `editor` can edit templates and start runs.
  - `admin` can manage members/invites.
- Confirm team templates and runs do not appear in the user's personal workspace.
- Confirm a Free user on a paid team receives paid team limits only while the team workspace is active.
- Confirm team activity records team create, invite create, invite accept, member update, and owner transfer events.

## Billing checks
- Start Stripe checkout for `Pro`.
- Confirm the checkout session opens the expected `Pro` price.
- Complete a purchase or use the agreed billing test path.
- Confirm the webhook updates entitlements and the account page shows `Pro`.
- Confirm the billing portal opens for the upgraded user.

## Production safety checks
- Run `pnpm run verify:staging` before preview/staging deploy.
- Run `pnpm run verify:prod:d1` before production deploy.
- Confirm preview/staging deploys use `serp-checklists-staging-db`, not production D1.
- Confirm the latest staging and production deploys completed successfully.
- Perform one authenticated production smoke check for `save template`.
- Perform one authenticated production smoke check for `copy template`.
- Perform one authenticated staging smoke check for team create/invite/accept before promoting team changes.

## Rollback checks
- If billing or gated actions fail, stop rollout and do not call launch complete.
- Use the previous known-good Pages deployment or a fresh rollback deploy from the last stable commit.
- If the issue is schema-related, apply the required checked-in D1 migrations before re-attempting release.
- Record the incident in `docs/knowledge/` after the rollback or fix.
