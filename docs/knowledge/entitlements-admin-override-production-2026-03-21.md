# Entitlements admin override in production (2026-03-21)

Production manual Pro/free overrides depend on two things being in place:

1. The D1 table from [0010_entitlement_overrides.sql](../../db/migrations/0010_entitlement_overrides.sql)
2. A live `ENTITLEMENTS_ADMIN_SECRET` Pages secret

What failed on March 21, 2026:

- The production database was missing `entitlement_overrides`
- `POST /api/admin/entitlements/override` returned `500`

What fixed it:

- Apply the checked-in migration file `db/migrations/0010_entitlement_overrides.sql` to production D1
- Add a temporary `ENTITLEMENTS_ADMIN_SECRET`
- Redeploy production so the Pages Functions runtime picks up the new secret
- Use the admin override endpoint
- Remove the temporary secret
- Redeploy production again to close the endpoint back down

Verification used:

- `POST /api/admin/entitlements/override` returned success for the target user
- Read-only D1 query confirmed the saved override row
- After secret removal and redeploy, the same endpoint returned `401 Unauthorized`
