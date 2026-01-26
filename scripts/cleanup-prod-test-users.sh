#!/usr/bin/env bash
set -euo pipefail

DB_NAME="serp-checklists-db"

table_list="$(npx wrangler d1 execute "$DB_NAME" --remote --command "SELECT name FROM sqlite_master WHERE type='table';")"

has_table() {
  echo "$table_list" | grep -q "\"name\": \"$1\""
}

target_users_subquery="(SELECT id FROM users WHERE id IN ('7acb44bc-527f-45de-89bd-00ec73a6f31f','b0f0a975-3a09-424d-890d-92e5c3518f74') OR email IN ('mvp-smoke+1766754431@serp-checklists.dev','smoke-test+1766747260@serp-checklists.dev'))"
sql=""

append_sql() {
  sql="$sql"$'\n'"$1"
}

if has_table "session"; then
  append_sql "DELETE FROM session WHERE user_id IN ${target_users_subquery};"
fi

if has_table "account"; then
  append_sql "DELETE FROM account WHERE user_id IN ${target_users_subquery};"
fi

if has_table "checklist_runs"; then
  append_sql "DELETE FROM checklist_runs WHERE user_id IN ${target_users_subquery};"
fi

if has_table "template_likes"; then
  append_sql "DELETE FROM template_likes WHERE user_id IN ${target_users_subquery};"
  if has_table "templates"; then
    append_sql "DELETE FROM template_likes WHERE template_id IN (SELECT id FROM templates WHERE user_id IN ${target_users_subquery});"
  fi
fi

if has_table "templates"; then
  append_sql "DELETE FROM templates WHERE user_id IN ${target_users_subquery};"
fi

if has_table "usage_analytics"; then
  append_sql "DELETE FROM usage_analytics WHERE user_id IN ${target_users_subquery};"
fi

if has_table "entitlement_overrides"; then
  append_sql "DELETE FROM entitlement_overrides WHERE user_id IN ${target_users_subquery};"
fi

if has_table "stripe_subscriptions"; then
  append_sql "DELETE FROM stripe_subscriptions WHERE user_id IN ${target_users_subquery};"
fi

if has_table "stripe_customers"; then
  append_sql "DELETE FROM stripe_customers WHERE user_id IN ${target_users_subquery};"
fi

if has_table "referral_visits"; then
  append_sql "DELETE FROM referral_visits WHERE referrer_id IN ${target_users_subquery};"
fi

if has_table "referrals"; then
  append_sql "DELETE FROM referrals WHERE referrer_id IN ${target_users_subquery} OR referred_user_id IN ${target_users_subquery};"
fi

if has_table "pages"; then
  append_sql "DELETE FROM pages WHERE user_id IN ${target_users_subquery};"
fi

append_sql "DELETE FROM users WHERE id IN ${target_users_subquery};"

npx wrangler d1 execute "$DB_NAME" --remote --command "$sql"
