# Entitlements admin override

This is a manual support tool to grant/revoke Pro without Stripe (e.g. comps, debugging).

The `entitlement_overrides` table must exist before this endpoint is used. Run
the normal D1 migration/status checks for the target environment first.

## Enable
Set `ENTITLEMENTS_ADMIN_SECRET` in Cloudflare Pages env vars.

For a one-off production override, prefer a temporary secret. Redeploy after
adding it so Pages Functions receive the value, perform and verify the override,
remove the secret, redeploy again, and confirm the endpoint returns `401`.

## Grant Pro
```bash
curl -X POST "https://serplists.com/api/admin/entitlements/override" \
  -H "Content-Type: application/json" \
  -H "X-Admin-Secret: $ENTITLEMENTS_ADMIN_SECRET" \
  -d '{"email":"admin@test.com","plan":"pro"}'
```

## Revoke (force Free)
```bash
curl -X POST "https://serplists.com/api/admin/entitlements/override" \
  -H "Content-Type: application/json" \
  -H "X-Admin-Secret: $ENTITLEMENTS_ADMIN_SECRET" \
  -d '{"email":"admin@test.com","plan":"free"}'
```

## Remove override
```bash
curl -X DELETE "https://serplists.com/api/admin/entitlements/override?userId=USER_ID" \
  -H "X-Admin-Secret: $ENTITLEMENTS_ADMIN_SECRET"
```

After any change, confirm the saved D1 row and verify `GET /api/billing/status`
for the affected user rather than relying only on the command response.
