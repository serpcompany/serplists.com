# Entitlements admin override

This is a manual support tool to grant/revoke Pro without Stripe (e.g. comps, debugging).

## Enable
Set `ENTITLEMENTS_ADMIN_SECRET` in Cloudflare Pages env vars.

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
