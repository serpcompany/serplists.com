# MVP Launch Sign-Off Checklist

This is the short sign-off pass for the current `Free + Pro` launch scope.

Status note:

- On March 21, 2026, launch was accepted for MVP tracking without a fresh formal rerun of every checklist item below.
- Keep this checklist as the reference if we want to run the full sign-off pass later.

## Free user checks
- Log in as a Free user.
- Open a public template and try `Copy templates into your account`.
- Confirm the user is blocked and sees the intended upgrade CTA.
- Confirm the user can still browse templates and use non-gated product flows.

## Pro user checks
- Log in as a Pro user.
- Open a public template and complete `Copy templates into your account`.
- Confirm the copied template appears in the user account and can be opened/edited.
- Confirm the user can save templates and start runs without backend errors.

## Billing checks
- Start Stripe checkout for `Pro`.
- Confirm the checkout session opens the expected `Pro` price.
- Complete a purchase or use the agreed billing test path.
- Confirm the webhook updates entitlements and the account page shows `Pro`.
- Confirm the billing portal opens for the upgraded user.

## Production safety checks
- Run `pnpm run check:prod:d1-schema` before deploy.
- Confirm the latest production deploy completed successfully.
- Perform one authenticated production smoke check for `save template`.
- Perform one authenticated production smoke check for `copy template`.

## Rollback checks
- If billing or gated actions fail, stop rollout and do not call launch complete.
- Use the previous known-good Pages deployment or a fresh rollback deploy from the last stable commit.
- If the issue is schema-related, apply the required checked-in D1 migrations before re-attempting release.
- Record the incident in `docs/knowledge/` after the rollback or fix.
